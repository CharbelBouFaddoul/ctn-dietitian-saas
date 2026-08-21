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

const SIMPLE_ASSESSMENT_SCHEMA = {
  sections: [
    {
      id: "main",
      title: "Basics",
      questions: [{ id: "goal", type: "TEXT", label: "Goal", required: true }],
    },
  ],
};

describe("dietitian-managed client workflow", () => {
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

  function email(prefix = "dmc"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email()) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: PASSWORD, audience: "dietitian" })
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
      .send({
        firstName: "Pat",
        lastName: "Managed",
        email: email("client"),
        ...body,
      })
      .expect(201);
    return res.body as { id: string; email: string; firstName: string; lastName: string };
  }

  async function seedFood() {
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: `dmc-src-${seq}`,
        name: "Test catalog",
        provider: "Test",
        datasetVersion: "1",
        license: "test",
        attribution: "test",
        importedAt: new Date(),
      },
    });
    return ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: `oats-${seq}`,
        name: "Oats",
        nameNormalized: "oats",
        category: "Grain",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 389,
        proteinG: 17,
        carbohydrateG: 66,
        fatG: 7,
        fiberG: 11,
        sugarG: 1,
        sodiumMg: 2,
        importedAt: new Date(),
      },
    });
  }

  it("creates a chart-only client and manages profile + measurements without portal login", async () => {
    const owner = await registerVerifyLogin(email("own"));
    const practice = await createPractice(owner.cookie, "Managed Clinic");
    const client = await createClient(owner.cookie, practice.id);

    const accounts = await ctx.prisma.clientAccount.count({ where: { clientId: client.id } });
    expect(accounts).toBe(0);

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(portfolio.body.client.connectionStatus).toBe("not_connected");
    expect(portfolio.body.previousWeight).toBeNull();

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ allergies: "peanuts", notes: "managed offline" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "HEIGHT", value: 170, unit: "cm", measuredAt: "2026-08-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 82, unit: "kg", measuredAt: "2026-08-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 80.5, unit: "kg", measuredAt: "2026-08-08T12:00:00.000Z" })
      .expect(201);

    const evolution = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/evolution`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(evolution.body.series.WEIGHT).toHaveLength(2);
    expect(evolution.body.latest.WEIGHT?.value).toBe(80.5);

    const updated = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(updated.body.previousWeight?.value).toBe(82);
    expect(updated.body.profile?.allergies).toBe("peanuts");
    expect(updated.body.bmi).toBeTruthy();
  });

  it("supports goals, meal plan, appointment, and assessment without portal login", async () => {
    const owner = await registerVerifyLogin(email("care"));
    const practice = await createPractice(owner.cookie, "Care Clinic");
    const client = await createClient(owner.cookie, practice.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Lose 5kg", targetValue: 75, targetUnit: "kg" })
      .expect(201);

    const meal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ name: "Week 1", clientId: client.id })
      .expect(201);
    const draftId = meal.body.versions[0].id as string;
    const food = await seedFood();
    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${meal.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast =
      draft.body.snapshot.days[0]?.meals.find((row: { name: string }) => row.name === "Breakfast") ??
      draft.body.snapshot.days[0]?.meals[0];
    expect(breakfast?.id).toBeTruthy();
    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${meal.body.id}/versions/${draftId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans/${meal.body.id}/versions/${draftId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({
        title: "Check-in",
        category: "FOLLOW_UP",
        startAt: "2026-09-15T10:00:00.000Z",
        endAt: "2026-09-15T11:00:00.000Z",
      })
      .expect(201);

    const template = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/assessment-templates`)
      .set("Cookie", owner.cookie)
      .send({ name: "Intake", schema: SIMPLE_ASSESSMENT_SCHEMA })
      .expect(201);

    const assessment = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/assessments`)
      .set("Cookie", owner.cookie)
      .send({ templateId: template.body.id })
      .expect(201);
    expect(assessment.body.schemaSnapshot).toBeTruthy();

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(portfolio.body.primaryGoal?.title).toBe("Lose 5kg");
    expect(portfolio.body.activeMealPlan?.id).toBe(meal.body.id);
    expect(portfolio.body.upcomingAppointment?.title).toBe("Check-in");
    expect(portfolio.body.latestAssessment?.id).toBe(assessment.body.id);
  });

  it("rejects dietitian writes for patient-owned daily tracking logs", async () => {
    const owner = await registerVerifyLogin(email("trk"));
    const practice = await createPractice(owner.cookie, "Tracking Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const base = `/api/v1/dietitian/${practice.id}/clients/${client.id}/tracking`;

    await request(ctx.app.getHttpServer())
      .post(`${base}/food-logs`)
      .set("Cookie", owner.cookie)
      .send({ foodId: "x", quantity: 1, unit: "g" })
      .expect(404);
    await request(ctx.app.getHttpServer())
      .post(`${base}/water-logs`)
      .set("Cookie", owner.cookie)
      .send({ amount: 250, unit: "ml" })
      .expect(404);
    await request(ctx.app.getHttpServer())
      .post(`${base}/exercise-logs`)
      .set("Cookie", owner.cookie)
      .send({ activityType: "walk", durationMinutes: 30 })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`${base}/summary`)
      .set("Cookie", owner.cookie)
      .expect(200);
  });

  it("lets the patient join later, see prior data, and start daily tracking", async () => {
    const owner = await registerVerifyLogin(email("trans"));
    const practice = await createPractice(owner.cookie, "Transition Clinic");
    const client = await createClient(owner.cookie, practice.id, { email: email("pat") });
    const food = await seedFood();

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ notes: "pre-portal care" })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 79, unit: "kg", measuredAt: "2026-08-10T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Stay consistent" })
      .expect(201);

    const meal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ name: "Published plan", clientId: client.id })
      .expect(201);
    const draftId = meal.body.versions[0].id as string;
    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${meal.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast =
      draft.body.snapshot.days[0]?.meals.find((row: { name: string }) => row.name === "Breakfast") ??
      draft.body.snapshot.days[0]?.meals[0];
    expect(breakfast?.id).toBeTruthy();
    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${meal.body.id}/versions/${draftId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans/${meal.body.id}/versions/${draftId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({
        title: "Kickoff",
        category: "CONSULTATION",
        startAt: "2026-09-20T09:00:00.000Z",
        endAt: "2026-09-20T10:00:00.000Z",
      })
      .expect(201);

    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    const profile = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", portal)
      .expect(200);
    expect(profile.body.client.id).toBe(client.id);

    const evolution = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", portal)
      .expect(200);
    expect(evolution.body.latest.WEIGHT?.value).toBe(79);

    const portalPlan = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portal)
      .expect(200);
    expect(portalPlan.body.plan?.name).toBe("Published plan");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", portal)
      .send({ amount: 400, unit: "ml", loggedAt: "2026-08-20T10:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portal)
      .send({
        foodId: food.id,
        quantity: 100,
        unit: "g",
        mealCategory: "BREAKFAST",
        consumedAt: "2026-08-20T08:00:00.000Z",
      })
      .expect(201);

    const summary = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/tracking/summary?date=2026-08-20`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(summary.body.water.totalMl).toBe(400);
    expect(summary.body.food.byMeal?.length ?? summary.body.food.logCount).toBeTruthy();
  });

  it("keeps dietitian chart access after deactivate and restores portal on rejoin", async () => {
    const owner = await registerVerifyLogin(email("rev"));
    const practice = await createPractice(owner.cookie, "Revoke Clinic");
    const client = await createClient(owner.cookie, practice.id, { email: email("rejoin") });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/measurements`)
      .set("Cookie", owner.cookie)
      .send({ type: "WEIGHT", value: 70, unit: "kg", measuredAt: "2026-08-05T12:00:00.000Z" })
      .expect(201);

    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(portfolio.body.client.connectionStatus).toBe("deactivated");
    expect(portfolio.body.latestMeasurements.some((m: { type: string }) => m.type === "WEIGHT")).toBe(
      true,
    );

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/clients/${client.id}/profile`)
      .set("Cookie", owner.cookie)
      .send({ notes: "still managing" })
      .expect(200);

    await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(403);

    const { code } = await generateJoinCode(ctx, owner.cookie, practice.id, client.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    const evo = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(evo.body.latest.WEIGHT?.value).toBe(70);

    const account = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(account.status).toBe("ACTIVE");
  });

  it("isolates managed clients across practices", async () => {
    const a = await registerVerifyLogin(email("isoA"));
    const b = await registerVerifyLogin(email("isoB"));
    const practiceA = await createPractice(a.cookie, "Practice A");
    const practiceB = await createPractice(b.cookie, "Practice B");
    const clientA = await createClient(a.cookie, practiceA.id);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practiceA.id}/clients/${clientA.id}/profile`)
      .set("Cookie", a.cookie)
      .send({ notes: "secret-a" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practiceA.id}/clients/${clientA.id}/profile`)
      .set("Cookie", b.cookie)
      .send({ notes: "hack" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/clients/${clientA.id}/measurements`)
      .set("Cookie", b.cookie)
      .send({ type: "WEIGHT", value: 99, unit: "kg", measuredAt: "2026-08-01T12:00:00.000Z" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", b.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", a.cookie)
      .expect(200)
      .expect((res) => expect(res.body.profile?.notes).toBe("secret-a"));
  });
});
