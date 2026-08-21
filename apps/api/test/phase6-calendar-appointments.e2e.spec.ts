import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { SESSION_COOKIE_NAME } from "@nutrition-saas/config";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  generateJoinCode,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";

const PASSWORD = "ValidPass12";
const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("phase6 calendar + appointments", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  function email(prefix = "p6cal"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email()) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: PASSWORD })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: PASSWORD })
      .expect(200);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: address.toLowerCase() },
    });
    return {
      address,
      cookie: `${SESSION_COOKIE_NAME}=${cookieValue(login.headers["set-cookie"])}`,
      id: user.id,
    };
  }

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string, clientEmail?: string) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: clientEmail ?? email("client"),
      })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  function slot(dayOffset: number, startHour: number, endHour: number) {
    const start = new Date("2026-09-01T00:00:00.000Z");
    start.setUTCDate(start.getUTCDate() + dayOffset);
    start.setUTCHours(startHour, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(endHour, 0, 0, 0);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  it("lets dietitian create, list, get, update, cancel with category and overlap rules", async () => {
    const owner = await registerVerifyLogin(email("own"));
    const other = await registerVerifyLogin(email("oth"));
    const org = await createOrg(owner.cookie, "Cal Practice");
    const otherOrg = await createOrg(other.cookie, "Other Practice");
    const client = await createClient(owner.cookie, org.id);
    const foreign = await createClient(other.cookie, otherOrg.id);

    const created = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({
        title: "Initial consult",
        category: "CONSULTATION",
        ...slot(2, 10, 11),
        notes: "Bring labs",
      })
      .expect(201);
    expect(created.body.category).toBe("CONSULTATION");
    expect(created.body.status).toBe("SCHEDULED");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${foreign.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Cross", category: "OTHER", ...slot(3, 10, 11) })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Bad", ...slot(4, 12, 11) })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Overlap", category: "FOLLOW_UP", ...slot(2, 10, 11) })
      .expect(409);

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/appointments?from=2026-09-01T00:00:00.000Z&to=2026-09-10T00:00:00.000Z`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/appointments/${created.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(detail.body.notes).toBe("Bring labs");

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/appointments/${created.body.id}`)
      .set("Cookie", owner.cookie)
      .send({ title: "Updated consult", category: "FOLLOW_UP", ...slot(2, 14, 15) })
      .expect(200);
    expect(updated.body.title).toBe("Updated consult");
    expect(updated.body.category).toBe("FOLLOW_UP");

    const cancelled = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/appointments/${created.body.id}/cancel`)
      .set("Cookie", owner.cookie)
      .expect(201);
    expect(cancelled.body.status).toBe("CANCELLED");

    // Cancelled slot can be reused
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Reuse slot", category: "OTHER", ...slot(2, 14, 15) })
      .expect(201);

    // With a connected patient, cancel notifies the other party.
    const client2 = await createClient(owner.cookie, org.id, email("notif"));
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client2);
    const withPortal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client2.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Notify me", category: "CONSULTATION", ...slot(20, 9, 10) })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/appointments/${withPortal.body.id}/cancel`)
      .set("Cookie", portalCookie)
      .expect(201);
    const pending = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/appointments/${withPortal.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(pending.body.status).toBe("CANCELLATION_PENDING");
    const requestNotifs = await ctx.prisma.notification.count({
      where: { targetId: withPortal.body.id, type: "APPOINTMENT_CANCELLATION_REQUESTED" },
    });
    expect(requestNotifs).toBeGreaterThanOrEqual(1);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/appointments/${withPortal.body.id}/accept-cancellation`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const cancelledNotifs = await ctx.prisma.notification.count({
      where: { targetId: withPortal.body.id, type: "APPOINTMENT_CANCELLATION_ACCEPTED" },
    });
    expect(cancelledNotifs).toBeGreaterThanOrEqual(1);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${otherOrg.id}/appointments/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/appointments`)
      .expect(401);
  });

  it("supports dietitian→patient reschedule accept and reject flows with notifications", async () => {
    const owner = await registerVerifyLogin(email("rsd"));
    const org = await createOrg(owner.cookie, "Reschedule Clinic");
    const client = await createClient(owner.cookie, org.id, email("rsc"));
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client);

    const created = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Visit", category: "ASSESSMENT", ...slot(5, 9, 10) })
      .expect(201);

    const proposed = slot(6, 11, 12);
    const pending = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/appointments/${created.body.id}/propose-reschedule`)
      .set("Cookie", owner.cookie)
      .send(proposed)
      .expect(201);
    expect(pending.body.status).toBe("RESCHEDULE_PENDING");
    expect(pending.body.proposedStartAt).toBe(proposed.startAt);

    // Proposer cannot accept own proposal
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/appointments/${created.body.id}/accept-reschedule`)
      .set("Cookie", owner.cookie)
      .expect(403);

    const portalView = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/appointments/${created.body.id}`)
      .set("Cookie", portalCookie)
      .expect(200);
    expect(portalView.body.status).toBe("RESCHEDULE_PENDING");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/appointments/${created.body.id}/accept-reschedule`)
      .set("Cookie", portalCookie)
      .expect(201);

    const accepted = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/appointments/${created.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(accepted.body.status).toBe("SCHEDULED");
    expect(accepted.body.startAt).toBe(proposed.startAt);
    expect(accepted.body.proposedStartAt).toBeNull();

    const proposedNotifs = await ctx.prisma.notification.count({
      where: { targetId: created.body.id, type: "APPOINTMENT_RESCHEDULE_PROPOSED" },
    });
    const acceptedNotifs = await ctx.prisma.notification.count({
      where: { targetId: created.body.id, type: "APPOINTMENT_RESCHEDULE_ACCEPTED" },
    });
    expect(proposedNotifs).toBeGreaterThanOrEqual(1);
    expect(acceptedNotifs).toBeGreaterThanOrEqual(1);

    // Reject path
    const second = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Second", category: "MEAL_PLAN", ...slot(8, 9, 10) })
      .expect(201);
    const originalStart = second.body.startAt as string;
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/appointments/${second.body.id}/propose-reschedule`)
      .set("Cookie", owner.cookie)
      .send(slot(9, 13, 14))
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/appointments/${second.body.id}/reject-reschedule`)
      .set("Cookie", portalCookie)
      .expect(201);
    const rejected = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/appointments/${second.body.id}`)
      .set("Cookie", portalCookie)
      .expect(200);
    expect(rejected.body.status).toBe("SCHEDULED");
    expect(rejected.body.startAt).toBe(originalStart);
    expect(rejected.body.proposedStartAt).toBeNull();
  });

  it("supports patient→dietitian propose/accept and activeClientId isolation", async () => {
    const ownerA = await registerVerifyLogin(email("oa"));
    const ownerB = await registerVerifyLogin(email("ob"));
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id, email("ca"));
    const clientB = await createClient(ownerB.cookie, orgB.id, email("cb"));

    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA);
    const { code } = await generateJoinCode(ctx, ownerB.cookie, orgB.id, clientB.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    const apptA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/appointments`)
      .set("Cookie", ownerA.cookie)
      .send({ title: "A visit", category: "CONSULTATION", ...slot(10, 9, 10) })
      .expect(201);
    const apptB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/appointments`)
      .set("Cookie", ownerB.cookie)
      .send({ title: "B visit", category: "FOLLOW_UP", ...slot(11, 9, 10) })
      .expect(201);

    // Active connection is A after join B? join may switch - set active to A
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientA.id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const listA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/appointments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(listA.body.some((row: { id: string }) => row.id === apptA.body.id)).toBe(true);
    expect(listA.body.some((row: { id: string }) => row.id === apptB.body.id)).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/appointments/${apptB.body.id}`)
      .set("Cookie", portalCookie)
      .expect(404);

    const proposal = slot(12, 15, 16);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/appointments/${apptA.body.id}/propose-reschedule`)
      .set("Cookie", portalCookie)
      .send(proposal)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/appointments/${apptA.body.id}/accept-reschedule`)
      .set("Cookie", ownerA.cookie)
      .expect(201);

    const after = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/appointments/${apptA.body.id}`)
      .set("Cookie", portalCookie)
      .expect(200);
    expect(after.body.startAt).toBe(proposal.startAt);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const listB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/appointments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(listB.body.some((row: { id: string }) => row.id === apptB.body.id)).toBe(true);
    expect(listB.body.some((row: { id: string }) => row.id === apptA.body.id)).toBe(false);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/appointments/${apptB.body.id}/cancel`)
      .set("Cookie", portalCookie)
      .expect(201);
  });
});
