import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  generateJoinCode,
  generatePracticeJoinCode,
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

const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8");

describe("revoke / rejoin portal workflow", () => {
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

  function email(prefix = "rr"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email()) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: TEST_PASSWORD, firstName: "Pat", lastName: "Patient" })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: address.toLowerCase() },
    });
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`, id: user.id };
  }

  async function createPractice(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string; name: string };
  }

  async function createClient(
    cookie: string,
    dietitianAccountId: string,
    body: Record<string, unknown> = {},
  ) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body })
      .expect(201);
    return res.body as { id: string; email: string; firstName: string; lastName: string };
  }

  it("same practice rejoin: deactivate → new per-client code → resolve → join → same ClientAccount ACTIVE", async () => {
    const owner = await registerVerifyLogin(email("ownA"));
    const practice = await createPractice(owner.cookie, "Harbor Rejoin");
    const client = await createClient(owner.cookie, practice.id, { email: email("rejoin") });
    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ allergies: "peanuts", notes: "keep-me" })
      .expect(200);

    const accountBefore = await ctx.prisma.clientAccount.findUniqueOrThrow({
      where: { clientId: client.id },
    });
    expect(accountBefore.status).toBe("ACTIVE");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const sessions = await ctx.prisma.session.findMany({
      where: { userId: accountBefore.userId, revokedAt: null },
    });
    expect(sessions.length).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", portalCookie).expect(200);
    await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(403);
    const onboarding = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/onboarding")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(onboarding.body.status).toBe("needs_join");

    const { code } = await generateJoinCode(ctx, owner.cookie, practice.id, client.id);
    const resolved = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join-code/resolve")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(200);
    expect(resolved.body.status).toBe("ok");
    expect(resolved.body.clientId).toBe(client.id);

    const joined = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);
    expect(joined.body.status).toBe("joined");
    expect(joined.body.clientId).toBe(client.id);

    const accountAfter = await ctx.prisma.clientAccount.findUniqueOrThrow({
      where: { clientId: client.id },
    });
    expect(accountAfter.id).toBe(accountBefore.id);
    expect(accountAfter.status).toBe("ACTIVE");
    expect(await ctx.prisma.clientAccount.count({ where: { userId: accountBefore.userId } })).toBe(1);

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200);
    expect(me.body.client.id).toBe(client.id);

    const profile = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(profile.body.allergies).toBe("peanuts");
  });

  it("different practice join: deactivated A stays isolated while B activates", async () => {
    const ownerA = await registerVerifyLogin(email("ownA"));
    const ownerB = await registerVerifyLogin(email("ownB"));
    const practiceA = await createPractice(ownerA.cookie, "Clinic A");
    const practiceB = await createPractice(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, practiceA.id, { email: email("shared") });
    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, practiceA.id, clientA);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", portalCookie)
      .send({ amount: 300, unit: "ml", loggedAt: new Date().toISOString() })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/clients/${clientA.id}/account/deactivate`)
      .set("Cookie", ownerA.cookie)
      .expect(201);

    const codeB = await generatePracticeJoinCode(ctx, ownerB.cookie, practiceB.id);
    const joinedB = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code: codeB.code, firstName: "Pat", lastName: "Shared" })
      .expect(201);
    expect(joinedB.body.status).toBe("joined");
    const clientBId = joinedB.body.clientId as string;
    expect(clientBId).not.toBe(clientA.id);

    const accountA = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: clientA.id } });
    expect(accountA.status).toBe("DEACTIVATED");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientBId })
      .expect(200);

    const date = new Date().toISOString().slice(0, 10);
    const summaryB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${date}`)
      .set("Cookie", portalCookie)
      .expect(200);
    expect(summaryB.body.water.totalMl).toBe(0);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${clientA.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(403);
  });

  it("duplicate active connection: resolve/join for same practice does not create another ClientAccount", async () => {
    const owner = await registerVerifyLogin(email("ownDup"));
    const practice = await createPractice(owner.cookie, "Dup Clinic");
    const code = await generatePracticeJoinCode(ctx, owner.cookie, practice.id);
    const patient = await registerVerifyLogin(email("patDup"));

    const joined = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: code.code, firstName: "Pat", lastName: "Dup" })
      .expect(201);
    const clientId = joined.body.clientId as string;
    expect(await ctx.prisma.clientAccount.count({ where: { userId: patient.id } })).toBe(1);

    const resolved = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join-code/resolve")
      .set("Cookie", patient.cookie)
      .send({ code: code.code })
      .expect(200);
    expect(resolved.body.status).toBe("already_connected");
    expect(resolved.body.clientId).toBe(clientId);

    const again = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: code.code })
      .expect(201);
    expect(again.body.status).toBe("already_connected");
    expect(again.body.clientId).toBe(clientId);
    expect(await ctx.prisma.clientAccount.count({ where: { userId: patient.id } })).toBe(1);
  });

  it("active connection preservation: deactivate A while B stays usable on the same session", async () => {
    const ownerA = await registerVerifyLogin(email("ownA2"));
    const ownerB = await registerVerifyLogin(email("ownB2"));
    const practiceA = await createPractice(ownerA.cookie, "Alpha");
    const practiceB = await createPractice(ownerB.cookie, "Beta");
    const codeA = await generatePracticeJoinCode(ctx, ownerA.cookie, practiceA.id);
    const codeB = await generatePracticeJoinCode(ctx, ownerB.cookie, practiceB.id);
    const patient = await registerVerifyLogin(email("patAB"));

    const joinedA = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: codeA.code, firstName: "Pat", lastName: "Multi" })
      .expect(201);
    const clientAId = joinedA.body.clientId as string;

    const joinedB = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: codeB.code })
      .expect(201);
    const clientBId = joinedB.body.clientId as string;

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientAId })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", patient.cookie)
      .send({ amount: 150, unit: "ml", loggedAt: new Date().toISOString() })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientBId })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", patient.cookie)
      .send({ amount: 500, unit: "ml", loggedAt: new Date().toISOString() })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientAId })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/clients/${clientAId}/account/deactivate`)
      .set("Cookie", ownerA.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", patient.cookie).expect(200);

    const session = await ctx.prisma.session.findFirstOrThrow({
      where: { userId: patient.id, revokedAt: null },
    });
    expect(session.activeClientId).toBe(clientBId);

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", patient.cookie).expect(200);
    expect(me.body.client.id).toBe(clientBId);

    const date = new Date().toISOString().slice(0, 10);
    const summaryB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${date}`)
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(summaryB.body.water.totalMl).toBe(500);

    const onboarding = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/onboarding")
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(onboarding.body.status).toBe("connected");
  });

  it("last connection: deactivate only A → session stays → needs_join → rejoin restores portal", async () => {
    const owner = await registerVerifyLogin(email("ownLast"));
    const practice = await createPractice(owner.cookie, "Only Clinic");
    const client = await createClient(owner.cookie, practice.id, { email: email("last") });
    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: client.email.toLowerCase() },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const openSessions = await ctx.prisma.session.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(openSessions).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", portalCookie).expect(200);
    expect(
      (await request(ctx.app.getHttpServer()).get("/api/v1/portal/onboarding").set("Cookie", portalCookie).expect(200))
        .body.status,
    ).toBe("needs_join");

    const { code } = await generateJoinCode(ctx, owner.cookie, practice.id, client.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201)
      .expect((res) => expect(res.body.clientId).toBe(client.id));

    await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200);
  });

  it("data preservation after deactivate/rejoin across profile, tracking, messages, docs, appointments, assessments, meal plans", async () => {
    const owner = await registerVerifyLogin(email("ownData"));
    const practice = await createPractice(owner.cookie, "Data Clinic");
    const client = await createClient(owner.cookie, practice.id, {
      email: email("data"),
      firstName: "Emma",
      lastName: "Data",
    });
    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ allergies: "shellfish", notes: "preserve-notes" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Walk daily", targetValue: 30, targetUnit: "min" })
      .expect(201);

    const loggedAt = new Date().toISOString();
    const date = loggedAt.slice(0, 10);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", portalCookie)
      .send({ amount: 400, unit: "ml", loggedAt })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/conversation/messages")
      .set("Cookie", portalCookie)
      .send({ body: "Please keep this thread" })
      .expect(201);

    const document = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/documents`)
      .set("Cookie", owner.cookie)
      .attach("file", PDF_BUFFER, { filename: "keep.pdf", contentType: "application/pdf" })
      .field("visibility", "SHARED")
      .expect(201);

    const start = new Date("2026-10-01T15:00:00.000Z");
    const end = new Date("2026-10-01T16:00:00.000Z");
    const appointment = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({
        title: "Follow-up",
        category: "FOLLOW_UP",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      })
      .expect(201);

    const template = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/assessment-templates`)
      .set("Cookie", owner.cookie)
      .send({
        name: "Intake",
        schema: {
          sections: [
            {
              id: "main",
              questions: [{ id: "reason", type: "TEXT", label: "Reason", required: false, active: true }],
            },
          ],
        },
      })
      .expect(201);
    const assessment = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/assessments`)
      .set("Cookie", owner.cookie)
      .send({ templateId: template.body.id })
      .expect(201);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "Keep Plan" })
      .expect(201);

    const accountId = (
      await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } })
    ).id;

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const { code } = await generateJoinCode(ctx, owner.cookie, practice.id, client.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join-code/resolve")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    const accountAfter = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(accountAfter.id).toBe(accountId);
    expect(accountAfter.status).toBe("ACTIVE");

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200);
    expect(me.body.client.firstName).toBe("Emma");
    expect(me.body.profile?.allergies).toBe("shellfish");

    const summary = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${date}`)
      .set("Cookie", portalCookie)
      .expect(200);
    expect(summary.body.water.totalMl).toBe(400);

    const messages = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/conversation/messages")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(messages.body.some((m: { body: string }) => m.body === "Please keep this thread")).toBe(true);

    const docs = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/documents")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(docs.body.some((d: { id: string }) => d.id === document.body.id)).toBe(true);

    const appts = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/appointments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(appts.body.some((a: { id: string }) => a.id === appointment.body.id)).toBe(true);

    const assessments = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/assessments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(assessments.body.some((a: { id: string }) => a.id === assessment.body.id)).toBe(true);

    const plans = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans?clientId=${client.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const planList = Array.isArray(plans.body) ? plans.body : (plans.body.items ?? []);
    expect(planList.some((p: { id: string }) => p.id === plan.body.id)).toBe(true);

    const goals = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(goals.body.some((g: { title: string }) => g.title === "Walk daily")).toBe(true);
  });
});
