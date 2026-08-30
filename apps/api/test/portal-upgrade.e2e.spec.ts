import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  resetAuthDatabase,
  TEST_PASSWORD,
  type AuthTestContext,
} from "./app";

const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("portal upgrade profile, measurements, booking", () => {
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

  function email(prefix = "pup"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email()) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  async function createPractice(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client") })
      .expect(201);
    return res.body as { id: string; email: string; firstName: string; lastName: string };
  }

  function futureSlot(dayOffset: number, startHour: number, endHour: number) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayOffset);
    start.setUTCHours(startHour, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(endHour, 0, 0, 0);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  it("GET /portal/me includes goals, units, measurements and hides status", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Me Clinic");
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({ ...SETTINGS, energyUnit: "kj", weightUnit: "lb", enabledMeasurements: ["WEIGHT", "WAIST"] })
      .expect(200);

    const client = await createClient(owner.cookie, practice.id);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Walk daily", targetValue: 8000, targetUnit: "steps" })
      .expect(201);

    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);
    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portal).expect(200);

    expect(me.body.client.status).toBeUndefined();
    expect(me.body.status).toBeUndefined();
    expect(me.body.energyUnit).toBe("kj");
    expect(me.body.weightUnit).toBe("lb");
    expect(me.body.enabledMeasurements).toEqual(["WEIGHT", "WAIST"]);
    expect(me.body.goals).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Walk daily", targetUnit: "steps" })]),
    );
    expect(me.body.profile).toEqual(
      expect.objectContaining({
        emergencyContactName: null,
        emergencyContactPhone: null,
      }),
    );
  });

  it("PATCH /portal/me updates identity and emergency contact but ignores goals and allergies", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Patch Clinic");
    const client = await createClient(owner.cookie, practice.id);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ allergies: "peanuts" })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Clinic goal" })
      .expect(201);

    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);
    await request(ctx.app.getHttpServer())
      .patch("/api/v1/portal/me")
      .set("Cookie", portal)
      .send({
        firstName: "Pat",
        lastName: "Client",
        allergies: "shellfish",
        goals: [{ title: "Patient-written goal" }],
      })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .patch("/api/v1/portal/me")
      .set("Cookie", portal)
      .send({
        firstName: "Pat",
        lastName: "Client",
        phone: "555-0100",
        emergencyContactName: "Sam Parent",
        emergencyContactPhone: "555-0199",
      })
      .expect(200);

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portal).expect(200);
    expect(me.body.client.phone).toBe("555-0100");
    expect(me.body.profile.emergencyContactName).toBe("Sam Parent");
    expect(me.body.profile.emergencyContactPhone).toBe("555-0199");
    expect(me.body.profile.allergies).toBe("peanuts");
    expect(me.body.goals).toEqual([expect.objectContaining({ title: "Clinic goal" })]);
    expect(me.body.goals).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: "Patient-written goal" })]));
  });

  it("lets a patient change password and login with the new password", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Password Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set("Cookie", portal)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "ValidPass99" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: client.email, password: TEST_PASSWORD })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: client.email, password: "ValidPass99" })
      .expect(200);
  });

  it("rejects portal measurements that the clinic has not enabled", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Measure Clinic");
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({ ...SETTINGS, enabledMeasurements: ["WEIGHT"] })
      .expect(200);
    const client = await createClient(owner.cookie, practice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/measurements")
      .set("Cookie", portal)
      .send({ type: "WEIGHT", value: 70, unit: "kg" })
      .expect(201);

    const rejected = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/measurements")
      .set("Cookie", portal)
      .send({ type: "WAIST", value: 80, unit: "cm" });
    expect(rejected.status).toBe(400);
  });

  it("creates a REQUESTED visit, accepts to SCHEDULED, and isolates from other clinics", async () => {
    const owner = await registerVerifyLogin();
    const other = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Book Clinic");
    const otherPractice = await createPractice(other.cookie, "Other Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const otherClient = await createClient(other.cookie, otherPractice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);
    const otherPortal = await connectClientPortal(ctx, other.cookie, otherPractice.id, otherClient);
    const slot = futureSlot(3, 10, 11);

    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/appointments")
      .set("Cookie", portal)
      .send({ category: "FOLLOW_UP", ...slot, notes: "Prefer morning" })
      .expect(201);
    expect(created.body.status).toBe("REQUESTED");
    expect(created.body.category).toBe("FOLLOW_UP");

    const otherList = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/appointments")
      .set("Cookie", otherPortal)
      .expect(200);
    expect(otherList.body.some((row: { id: string }) => row.id === created.body.id)).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${otherPractice.id}/appointments/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(404);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/appointments")
      .set("Cookie", portal)
      .expect(200);
    expect(listed.body.some((row: { id: string; status: string }) => row.id === created.body.id && row.status === "REQUESTED")).toBe(
      true,
    );

    const accepted = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/appointments/${created.body.id}/accept-request`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);
    expect(accepted.body.status).toBe("SCHEDULED");

    const afterAccept = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/appointments/${created.body.id}`)
      .set("Cookie", portal)
      .expect(200);
    expect(afterAccept.body.status).toBe("SCHEDULED");
  });

  it("declines a REQUESTED visit to CANCELLED", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Decline Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);
    const slot = futureSlot(4, 14, 15);

    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/appointments")
      .set("Cookie", portal)
      .send({ category: "CONSULTATION", ...slot })
      .expect(201);

    const declined = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/appointments/${created.body.id}/decline-request`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);
    expect(declined.body.status).toBe("CANCELLED");

    const after = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/appointments/${created.body.id}`)
      .set("Cookie", portal)
      .expect(200);
    expect(after.body.status).toBe("CANCELLED");
  });
});
