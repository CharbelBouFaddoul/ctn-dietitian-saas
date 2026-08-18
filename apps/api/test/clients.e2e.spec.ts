import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { CLIENT_ACCESS_DENIED, CLIENT_EMAIL_IN_USE, CLIENT_LIMIT_REACHED } from "../src/clients/client.messages";
import { ORGANIZATION_ACCESS_DENIED } from "../src/organizations/tenant.types";
import { PLATFORM_ASSESSMENT_TEMPLATE_ID } from "../src/assessments/platform-template.seed";
import {
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
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

describe("Phase 5 practice clients", () => {
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

  function email(prefix = "user"): string {
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
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    const plan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "standard" } });
    await ctx.prisma.subscription.create({
      data: { organizationId: created.body.id, planId: plan.id, status: "ACTIVE" },
    });
    return created.body as { id: string; name: string };
  }

  async function orgContext(cookie: string, organizationId: string) {
    const current = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}`)
      .set("Cookie", cookie)
      .expect(200);
    return current.body.context as { membershipId: string; role: string };
  }

  async function createClient(
    cookie: string,
    organizationId: string,
    body: Record<string, unknown> = {},
  ) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Ada",
        lastName: "Lovelace",
        email: email("client"),
        ...body,
      });
  }

  it("isolates clients, timeline, assessments, and appointments across organizations", async () => {
    const alice = await registerVerifyLogin();
    const bob = await registerVerifyLogin();
    const orgA = await createOrg(alice.cookie, "Clinic A");
    const orgB = await createOrg(bob.cookie, "Clinic B");

    const clientA = await createClient(alice.cookie, orgA.id, { firstName: "Pat", lastName: "A" });
    expect(clientA.status).toBe(201);
    const clientB = await createClient(bob.cookie, orgB.id, { firstName: "Pat", lastName: "B" });
    expect(clientB.status).toBe(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}`)
      .set("Cookie", alice.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}`)
      .set("Cookie", alice.cookie)
      .send({ firstName: "Hacked" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}/clients/${clientB.body.id}`)
      .set("Cookie", alice.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(ORGANIZATION_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}/timeline`)
      .set("Cookie", alice.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}/assessments`)
      .set("Cookie", alice.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}/appointments`)
      .set("Cookie", alice.cookie)
      .expect(403);

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/clients`)
      .set("Cookie", alice.cookie)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].id).toBe(clientA.body.id);
  });

  it("enforces OWNER vs assigned DIETITIAN vs STAFF client access and assignment history", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const otherDietitian = await registerVerifyLogin();
    const staff = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Practice");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: otherDietitian.address, role: "DIETITIAN" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: staff.address, role: "STAFF" })
      .expect(201);

    const dietitianCtx = await orgContext(dietitian.cookie, org.id);
    const otherCtx = await orgContext(otherDietitian.cookie, org.id);
    const staffCtx = await orgContext(staff.cookie, org.id);

    const assigned = await createClient(owner.cookie, org.id, {
      firstName: "Assigned",
      lastName: "Client",
      assignedMemberId: dietitianCtx.membershipId,
    });
    expect(assigned.status).toBe(201);
    const unassigned = await createClient(owner.cookie, org.id, {
      firstName: "Unassigned",
      lastName: "Client",
    });
    expect(unassigned.status).toBe(201);

    const ownerList = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(ownerList.body.total).toBe(2);

    const dietitianList = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients`)
      .set("Cookie", dietitian.cookie)
      .expect(200);
    expect(dietitianList.body.items.map((row: { id: string }) => row.id)).toEqual([assigned.body.id]);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}`)
      .set("Cookie", dietitian.cookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${unassigned.body.id}`)
      .set("Cookie", dietitian.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/clients/${unassigned.body.id}`)
      .set("Cookie", dietitian.cookie)
      .send({ firstName: "Nope" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients`)
      .set("Cookie", staff.cookie)
      .send({ firstName: "Staff", lastName: "Create" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/assignments`)
      .set("Cookie", owner.cookie)
      .send({ organizationMemberId: staffCtx.membershipId })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/profile`)
      .set("Cookie", staff.cookie)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/archive`)
      .set("Cookie", staff.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/account/invite`)
      .set("Cookie", staff.cookie)
      .expect(403);

    const historyBefore = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/assignments`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(historyBefore.body.filter((row: { active: boolean }) => row.active)).toHaveLength(1);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/assignments`)
      .set("Cookie", owner.cookie)
      .send({ organizationMemberId: otherCtx.membershipId })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}`)
      .set("Cookie", dietitian.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}`)
      .set("Cookie", otherDietitian.cookie)
      .expect(200);

    const history = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/assignments`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(history.body).toHaveLength(3);
    expect(history.body.filter((row: { active: boolean }) => row.active)).toHaveLength(1);
    expect(history.body.some((row: { unassignedAt: string | null }) => row.unassignedAt !== null)).toBe(true);
  });

  it("creates a client portal account without making the client an organization member", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Portal Practice");
    const clientEmail = email("portal");
    const created = await createClient(owner.cookie, org.id, {
      email: clientEmail,
      invitePortal: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.portalStatus).toBe("PENDING");

    const members = await ctx.prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: true },
    });
    expect(members.every((row) => row.user.email !== clientEmail)).toBe(true);
    expect(members.every((row) => String(row.role) !== "CLIENT")).toBe(true);

    const inviteMail = ctx.emails.messages.find((message) => message.text.includes("CLIENT_INVITE"));
    expect(inviteMail).toBeTruthy();
    const rawToken = extractEmailedToken(inviteMail!.text);

    const preview = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/invitations/preview")
      .send({ token: rawToken })
      .expect(200);
    expect(preview.body.email).toBe(clientEmail.toLowerCase());

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: rawToken, password: PASSWORD })
      .expect(200);

    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: clientEmail, password: PASSWORD })
      .expect(200);
    const portalCookie = `ns_session=${cookieValue(login.headers["set-cookie"])}`;

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200);
    expect(me.body.client.id).toBe(created.body.id);

    const other = await createClient(owner.cookie, org.id, { firstName: "Other", lastName: "Person" });
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${other.body.id}`)
      .set("Cookie", portalCookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${created.body.id}/timeline`)
      .set("Cookie", portalCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: clientEmail, role: "DIETITIAN" })
      .expect(409)
      .expect((res) => expect(res.body.message).toBe(CLIENT_EMAIL_IN_USE));

    const accounts = await ctx.prisma.clientAccount.findMany({ where: { clientId: created.body.id } });
    expect(accounts).toHaveLength(1);
  });

  it("archives clients without deleting history and disables portal authentication", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Archive Practice");
    const clientEmail = email("archive");
    const created = await createClient(owner.cookie, org.id, { email: clientEmail });
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${created.body.id}/account/invite`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const rawToken = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: rawToken, password: PASSWORD })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${created.body.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Walk daily" })
      .expect(201);

    const userBefore = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: clientEmail.toLowerCase() },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${created.body.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const stored = await ctx.prisma.client.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.status).toBe("ARCHIVED");
    expect(await ctx.prisma.clientGoal.count({ where: { clientId: created.body.id } })).toBe(1);
    expect(await ctx.prisma.user.findUniqueOrThrow({ where: { id: userBefore.id } })).toMatchObject({
      id: userBefore.id,
    });

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: clientEmail, password: PASSWORD })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${created.body.id}/restore`)
      .set("Cookie", owner.cookie)
      .send({ status: "ACTIVE" })
      .expect(201);

    const restored = await ctx.prisma.client.findMany({ where: { organizationId: org.id } });
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe(created.body.id);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: clientEmail, password: PASSWORD })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${created.body.id}/account/invite`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const reopen = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: reopen, password: PASSWORD })
      .expect(200);

    const accounts = await ctx.prisma.clientAccount.findMany({ where: { clientId: created.body.id } });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.userId).toBe(userBefore.id);
  });

  it("protects profile, goals, measurements, tags, and deactivates portal accounts", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Records");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const client = await createClient(owner.cookie, org.id, { email: email("records") });

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/clients/${client.body.id}/profile`)
      .set("Cookie", dietitian.cookie)
      .send({ allergies: "peanuts" })
      .expect(403);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/clients/${client.body.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ allergies: "peanuts", notes: "practice notes" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/goals`)
      .set("Cookie", dietitian.cookie)
      .send({ title: "Hidden" })
      .expect(403);
    const goal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Sleep 8 hours", targetValue: 8, targetUnit: "h" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 154, unit: "lb", measuredAt: new Date().toISOString() })
      .expect(201)
      .expect((res) => {
        expect(res.body.unit).toBe("kg");
        expect(res.body.value).toBeCloseTo(69.853, 2);
      });

    const tag = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/tags`)
      .set("Cookie", owner.cookie)
      .send({ name: "VIP", color: "#123456" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/organizations/${org.id}/clients/${client.body.id}/tags`)
      .set("Cookie", owner.cookie)
      .send({ tagIds: [tag.body.id] })
      .expect(200);

    const otherOwner = await registerVerifyLogin();
    const otherOrg = await createOrg(otherOwner.cookie, "Other");
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/organizations/${otherOrg.id}/clients/${client.body.id}/tags`)
      .set("Cookie", otherOwner.cookie)
      .send({ tagIds: [tag.body.id] })
      .expect(403);
    const otherClient = await createClient(otherOwner.cookie, otherOrg.id);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/organizations/${otherOrg.id}/clients/${otherClient.body.id}/tags`)
      .set("Cookie", otherOwner.cookie)
      .send({ tagIds: [tag.body.id] })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/goals/${goal.body.id}/complete`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/account/invite`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const rawToken = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: rawToken, password: PASSWORD })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/account/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: client.body.email, password: PASSWORD })
      .expect(401);
  });

  it("preserves assessment template version and authorizes appointments and timeline", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinical");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const client = await createClient(owner.cookie, org.id);

    const started = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/assessments`)
      .set("Cookie", owner.cookie)
      .send({ templateId: PLATFORM_ASSESSMENT_TEMPLATE_ID })
      .expect(201);
    expect(started.body.templateVersion).toBe(1);

    const completed = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/assessments/${started.body.id}/complete`)
      .set("Cookie", owner.cookie)
      .send({ responses: { reason: "energy" } })
      .expect(201);
    expect(completed.body.templateVersion).toBe(1);

    const orgTemplate = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/assessment-templates`)
      .set("Cookie", owner.cookie)
      .send({ name: "Practice template", schema: { sections: [] } })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/assessment-templates/${orgTemplate.body.id}`)
      .set("Cookie", owner.cookie)
      .send({ schema: { sections: [{ id: "v2" }] } })
      .expect(200)
      .expect((res) => expect(res.body.version).toBe(2));

    await ctx.prisma.assessmentTemplate.update({
      where: { id: PLATFORM_ASSESSMENT_TEMPLATE_ID },
      data: { schema: { sections: [{ id: "changed" }] }, version: 2 },
    });

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/assessments`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body[0].templateVersion).toBe(1);
    expect(listed.body[0].responses).toEqual({ reason: "energy" });

    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Follow-up", startAt: start, endAt: end })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/appointments`)
      .set("Cookie", dietitian.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", dietitian.cookie)
      .expect(403);

    const timeline = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(timeline.body.some((row: { type: string }) => row.type === "ASSESSMENT_COMPLETED")).toBe(true);
    expect(timeline.body.every((row: { metadata: unknown }) => JSON.stringify(row.metadata ?? {}).length < 500)).toBe(
      true,
    );
  });

  it("enforces CLIENT_LIMIT through EntitlementService and writes sanitized audit records", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Limited");
    const feature = await ctx.prisma.feature.findUniqueOrThrow({ where: { key: FEATURE_KEYS.CLIENT_LIMIT } });
    await ctx.prisma.featureOverride.create({
      data: {
        organizationId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 1,
        reason: "test quota",
      },
    });

    const first = await createClient(owner.cookie, org.id);
    expect(first.status).toBe(201);
    const second = await createClient(owner.cookie, org.id, { firstName: "Two" });
    expect(second.status).toBe(403);
    expect(second.body.message).toBe(CLIENT_LIMIT_REACHED);

    const audits = await ctx.prisma.auditLog.findMany({
      where: { organizationId: org.id, action: { in: ["client_created", "client_account_invited"] } },
    });
    expect(audits.some((row) => row.action === "client_created")).toBe(true);
    for (const row of audits) {
      const raw = JSON.stringify(row.metadata ?? {});
      expect(raw).not.toMatch(/password/i);
      expect(raw).not.toMatch(/token/i);
      expect(raw).not.toContain(first.body.email ?? "never");
    }
  });

  it("expands practice settings without requiring them at organization creation", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Settings Clinic");
    const settings = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(settings.body.timezone).toBe("UTC");
    expect(settings.body.defaultAppointmentMinutes).toBe(60);

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({
        ...SETTINGS,
        practiceName: "North Nutrition",
        contactEmail: "clinic@example.com",
        defaultAppointmentMinutes: 45,
      })
      .expect(200);
    expect(updated.body.practiceName).toBe("North Nutrition");
    expect(updated.body.defaultAppointmentMinutes).toBe(45);
  });
});
