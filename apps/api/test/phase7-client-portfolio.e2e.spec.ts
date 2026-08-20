import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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

describe("phase7 client portfolio evolution assessments", () => {
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

  function email(prefix = "p7"): string {
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
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`, id: user.id };
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

  async function createClient(cookie: string, dietitianAccountId: string, body: Record<string, unknown> = {}) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: email("client"),
        ...body,
      })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  it("returns portfolio with measurements appointment meal plan and denies cross-tenant", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const orgA = await createOrg(a.cookie, "Practice A");
    const orgB = await createOrg(b.cookie, "Practice B");
    const clientA = await createClient(a.cookie, orgA.id, { firstName: "Ann" });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/measurements`)
      .set("Cookie", a.cookie)
      .send({ type: "WEIGHT", value: 80, unit: "kg", measuredAt: "2026-01-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/measurements`)
      .set("Cookie", a.cookie)
      .send({ type: "HEIGHT", value: 170, unit: "cm", measuredAt: "2026-01-01T12:00:00.000Z" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/appointments`)
      .set("Cookie", a.cookie)
      .send({
        title: "Follow-up",
        category: "FOLLOW_UP",
        startAt: "2026-09-01T10:00:00.000Z",
        endAt: "2026-09-01T11:00:00.000Z",
      })
      .expect(201);

    const meal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/meal-plans`)
      .set("Cookie", a.cookie)
      .send({ name: "Plan A", clientId: clientA.id })
      .expect(201);

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", a.cookie)
      .expect(200);

    expect(portfolio.body.client.firstName).toBe("Ann");
    expect(portfolio.body.bmi).toBeTruthy();
    expect(portfolio.body.latestMeasurements.length).toBeGreaterThanOrEqual(2);
    expect(portfolio.body.upcomingAppointment?.title).toBe("Follow-up");
    expect(portfolio.body.activeMealPlan?.id).toBe(meal.body.id);
    expect(portfolio.body.evolutionSummary).toBeNull();

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", a.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", b.cookie)
      .expect(403);
  });

  it("returns evolution series BMI comparison filters and empty state", async () => {
    const owner = await registerVerifyLogin(email("evo"));
    const other = await registerVerifyLogin(email("evx"));
    const org = await createOrg(owner.cookie, "Evo Practice");
    await createOrg(other.cookie, "Other");
    const client = await createClient(owner.cookie, org.id);

    const empty = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/evolution`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(empty.body.comparison.available).toBe(false);
    expect(empty.body.bmiSeries).toEqual([]);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "HEIGHT", value: 170, unit: "cm", measuredAt: "2026-01-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 80, unit: "kg", measuredAt: "2026-01-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 78, unit: "kg", measuredAt: "2026-02-01T12:00:00.000Z" })
      .expect(201);

    const evo = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/evolution`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(evo.body.series.WEIGHT).toHaveLength(2);
    expect(evo.body.series.HEIGHT).toHaveLength(1);
    expect(evo.body.bmiSeries.length).toBe(2);
    expect(evo.body.comparison.available).toBe(true);
    expect(evo.body.comparison.weight.absolute).toBe(-2);
    expect(evo.body.bmiSeries[0].value).toBeTruthy();

    const filtered = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${org.id}/clients/${client.id}/measurements?type=WEIGHT&from=2026-01-15T00:00:00.000Z`,
      )
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].value).toBe(78);

    const ranged = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${org.id}/clients/${client.id}/evolution?from=2026-01-15T00:00:00.000Z&to=2026-03-01T00:00:00.000Z`,
      )
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(ranged.body.series.WEIGHT).toHaveLength(1);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/evolution`)
      .set("Cookie", other.cookie)
      .expect(403);

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(portfolio.body.evolutionSummary?.weightDelta).toBe(-2);
  });

  it("supports assessment question editor snapshot and portal submit isolation", async () => {
    const ownerA = await registerVerifyLogin(email("oa"));
    const ownerB = await registerVerifyLogin(email("ob"));
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id, { firstName: "Ann" });
    const clientB = await createClient(ownerB.cookie, orgB.id, { firstName: "Ben" });

    const template = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates`)
      .set("Cookie", ownerA.cookie)
      .send({
        name: "Intake",
        schema: {
          sections: [
            {
              id: "main",
              title: "Questions",
              questions: [
                { id: "goal", type: "TEXT", label: "Goal", required: true, active: true },
              ],
            },
          ],
        },
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates/${template.body.id}/questions`)
      .set("Cookie", ownerA.cookie)
      .send({
        sectionId: "main",
        id: "energy",
        type: "NUMBER",
        label: "Energy 1-10",
        required: false,
        active: true,
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates/${template.body.id}/questions/reorder`)
      .set("Cookie", ownerA.cookie)
      .send({ sectionId: "main", orderedIds: ["energy", "goal"] })
      .expect(201);

    const started = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/assessments`)
      .set("Cookie", ownerA.cookie)
      .send({ templateId: template.body.id })
      .expect(201);
    expect(started.body.schemaSnapshot).toBeTruthy();
    expect(started.body.schema.sections[0].questions.map((q: { id: string }) => q.id)).toEqual([
      "energy",
      "goal",
    ]);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/assessments/${started.body.id}`)
      .set("Cookie", ownerA.cookie)
      .send({ responses: { goal: "Lose weight", energy: 7 } })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/assessments/${started.body.id}/complete`)
      .set("Cookie", ownerA.cookie)
      .send({})
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates/${template.body.id}/questions/goal/deactivate`)
      .set("Cookie", ownerA.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates/${template.body.id}/questions`)
      .set("Cookie", ownerA.cookie)
      .send({
        sectionId: "main",
        id: "newq",
        type: "TEXT",
        label: "New question",
        active: true,
      })
      .expect(201);

    const historical = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/assessments/${started.body.id}`)
      .set("Cookie", ownerA.cookie)
      .expect(200);
    expect(historical.body.responses).toEqual({ goal: "Lose weight", energy: 7 });
    expect(historical.body.schema.sections[0].questions.map((q: { id: string }) => q.id)).toEqual([
      "energy",
      "goal",
    ]);
    expect(historical.body.schema.sections[0].questions.find((q: { id: string }) => q.id === "newq")).toBeUndefined();

    const templateB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/assessment-templates`)
      .set("Cookie", ownerB.cookie)
      .send({
        name: "B Intake",
        schema: {
          sections: [{ id: "main", questions: [{ id: "q1", type: "TEXT", label: "B Q", active: true }] }],
        },
      })
      .expect(201);
    const startedB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/assessments`)
      .set("Cookie", ownerB.cookie)
      .send({ templateId: templateB.body.id })
      .expect(201);

    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA);
    const { code } = await generateJoinCode(ctx, ownerB.cookie, orgB.id, clientB.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientA.id })
      .expect(200);

    const listA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/assessments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(listA.body.some((row: { id: string }) => row.id === started.body.id)).toBe(true);
    expect(listA.body.some((row: { id: string }) => row.id === startedB.body.id)).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/assessments/${startedB.body.id}`)
      .set("Cookie", portalCookie)
      .expect(404);

    const evoA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(evoA.body).toHaveProperty("series");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect(200);

    const listB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/assessments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(listB.body.some((row: { id: string }) => row.id === startedB.body.id)).toBe(true);
    expect(listB.body.some((row: { id: string }) => row.id === started.body.id)).toBe(false);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/portal/assessments/${startedB.body.id}`)
      .set("Cookie", portalCookie)
      .send({ responses: { q1: "hello" } })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/assessments/${startedB.body.id}/complete`)
      .set("Cookie", portalCookie)
      .send({})
      .expect(201);

    const viewed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/assessments/${startedB.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(200);
    expect(viewed.body.status).toBe("COMPLETED");
    expect(viewed.body.responses).toEqual({ q1: "hello" });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/assessments/${started.body.id}`)
      .set("Cookie", portalCookie)
      .expect(404);

    await request(ctx.app.getHttpServer()).get("/api/v1/portal/assessments").expect(401);
  });
});
