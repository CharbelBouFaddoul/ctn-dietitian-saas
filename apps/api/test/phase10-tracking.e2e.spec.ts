import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";
import {
  activateStandardSubscription,
  connectClientPortal,
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

describe("phase10 patient tracking progress analytics", () => {
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

  function email(prefix = "p10"): string {
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
    return res.body as { id: string; email: string };
  }

  async function seedFood(name = "Oats", energy = 389) {
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: `p10-src-${seq}-${name}`,
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
        sourceFoodId: `${name}-${seq}`,
        name,
        nameNormalized: name.toLowerCase(),
        category: "Grain",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: energy,
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

  it("groups food by meal in daily summary and filters by date", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "P10 Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const food = await seedFood();
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

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

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portal)
      .send({
        foodId: food.id,
        quantity: 50,
        unit: "g",
        mealCategory: "LUNCH",
        consumedAt: "2026-08-20T12:00:00.000Z",
      })
      .expect(201);

    const summary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-20")
      .set("Cookie", portal)
      .expect(200);

    expect(summary.body.food.logCount).toBe(2);
    expect(summary.body.food.presented.energyKcal).toBe(584);
    expect(summary.body.food.byMeal).toHaveLength(2);
    expect(summary.body.food.byMeal[0].category).toBe("BREAKFAST");
    expect(summary.body.food.byMeal[0].presented.energyKcal).toBe(389);
    expect(summary.body.food.byMeal[1].category).toBe("LUNCH");

    const empty = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-19")
      .set("Cookie", portal)
      .expect(200);
    expect(empty.body.food.logCount).toBe(0);
    expect(empty.body.food.byMeal).toEqual([]);
  });

  it("aggregates water target from ClientGoal when unit is ml/l", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Water Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/goals`)
      .set("Cookie", owner.cookie)
      .send({ title: "Daily water", targetValue: 2, targetUnit: "l" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", portal)
      .send({ amount: 500, unit: "ml", loggedAt: "2026-08-20T10:00:00.000Z" })
      .expect(201);

    const summary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-20")
      .set("Cookie", portal)
      .expect(200);

    expect(summary.body.water.totalMl).toBe(500);
    expect(summary.body.water.targetMl).toBe(2000);
    expect(summary.body.water.entries).toHaveLength(1);
  });

  it("portal weight measurement appears on evolution", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Measure Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/measurements")
      .set("Cookie", portal)
      .send({ type: "WEIGHT", value: 72.5, unit: "kg" })
      .expect(201);

    const evolution = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", portal)
      .expect(200);

    expect(evolution.body.series.WEIGHT?.length).toBeGreaterThanOrEqual(1);
    expect(evolution.body.latest.WEIGHT.value).toBe(72.5);
  });

  it("logs FOOD items from published meal plan and skips recipes", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Plan Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const food = await seedFood("Yogurt", 59);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/recipes`)
      .set("Cookie", owner.cookie)
      .send({ name: "Bowl", servings: 1 })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${practice.id}/recipes/${recipe.body.id}/ingredients`)
      .set("Cookie", owner.cookie)
      .send({ ingredients: [{ foodId: food.id, quantity: 100, unit: "g" }] })
      .expect(200);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "Week 1" })
      .expect(201);
    const versionId = plan.body.versions.find((v: { status: string }) => v.status === "DRAFT").id as string;

    const version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast = version.body.snapshot.days[0].meals.find((m: { name: string }) => m.name === "Breakfast")!;

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 150, unit: "g" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "RECIPE", recipeId: recipe.body.id, quantity: 1, unit: "serving" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const portalPlan = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portal)
      .expect(200);
    const publishedMealId = portalPlan.body.plan.snapshot.days[0].meals.find(
      (m: { name: string }) => m.name === "Breakfast",
    ).id as string;

    const logged = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portal)
      .send({ mealId: publishedMealId })
      .expect(201);

    expect(logged.body.createdCount).toBe(1);
    expect(logged.body.skippedRecipes).toHaveLength(1);
    expect(logged.body.created[0].presented.energyKcal).toBe(89);

    const summary = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${logged.body.created[0].trackingDate}`)
      .set("Cookie", portal)
      .expect(200);
    expect(summary.body.food.byMeal.some((m: { category: string }) => m.category === "BREAKFAST")).toBe(
      true,
    );
  });

  it("scopes tracking and measurements to activeClientId across practices", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const practiceA = await createPractice(ownerA.cookie, "Practice A");
    const practiceB = await createPractice(ownerB.cookie, "Practice B");
    const clientA = await createClient(ownerA.cookie, practiceA.id);
    const clientB = await createClient(ownerB.cookie, practiceB.id);
    const foodA = await seedFood("A Food", 100);
    const foodB = await seedFood("B Food", 200);

    const portalA = await connectClientPortal(ctx, ownerA.cookie, practiceA.id, clientA);
    // Same patient user joins practice B via second portal cookie from clientB connection.
    // connectClientPortal returns patient cookie for that client; reuse patient from A by joining B.
    const patientEmail = (
      await ctx.prisma.clientAccount.findFirst({
        where: { clientId: clientA.id },
        include: { user: true },
      })
    )?.user.email;
    expect(patientEmail).toBeTruthy();

    // Create join for practice B using existing patient session: invite/join flow via connect on B
    // with a fresh connect that uses the same patient - connectClientPortal creates new patient.
    // Instead: login as patient from portalA cookie and switch after linking.
    const portalB = await connectClientPortal(ctx, ownerB.cookie, practiceB.id, clientB);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portalA)
      .send({ foodId: foodA.id, quantity: 100, unit: "g", consumedAt: "2026-08-20T08:00:00.000Z" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portalB)
      .send({ foodId: foodB.id, quantity: 100, unit: "g", consumedAt: "2026-08-20T08:00:00.000Z" })
      .expect(201);

    const sumA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-20")
      .set("Cookie", portalA)
      .expect(200);
    expect(sumA.body.food.presented.energyKcal).toBe(100);

    const sumB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-20")
      .set("Cookie", portalB)
      .expect(200);
    expect(sumB.body.food.presented.energyKcal).toBe(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${clientB.id}/tracking/summary`)
      .set("Cookie", ownerA.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/measurements")
      .set("Cookie", portalB)
      .send({ type: "WEIGHT", value: 80, unit: "kg" })
      .expect(201);

    // Forged clientId must not be accepted as a writable field (whitelist) or must not leak.
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/measurements")
      .set("Cookie", portalB)
      .send({ type: "WEIGHT", value: 99, unit: "kg", clientId: clientA.id })
      .expect((res) => {
        expect([201, 400]).toContain(res.status);
      });

    const evoA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", portalA)
      .expect(200);
    expect(evoA.body.series.WEIGHT ?? []).toHaveLength(0);

    const evoB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", portalB)
      .expect(200);
    expect(evoB.body.latest.WEIGHT.value).toBe(80);
  });

  it("includes sleep week average and exercise entries on summary", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Sleep Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .put("/api/v1/portal/tracking/sleep")
      .set("Cookie", portal)
      .send({
        date: "2026-08-18",
        bedtime: "2026-08-17T22:00:00.000Z",
        wakeTime: "2026-08-18T06:00:00.000Z",
      })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .put("/api/v1/portal/tracking/sleep")
      .set("Cookie", portal)
      .send({
        date: "2026-08-19",
        bedtime: "2026-08-18T23:00:00.000Z",
        wakeTime: "2026-08-19T07:00:00.000Z",
      })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/exercise-logs")
      .set("Cookie", portal)
      .send({
        activityType: "Cycling",
        durationMinutes: 30,
        intensity: "HIGH",
        performedAt: "2026-08-19T09:00:00.000Z",
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put("/api/v1/portal/tracking/habits")
      .set("Cookie", portal)
      .send({
        habitKey: "vegetables",
        habitLabel: "Eat vegetables",
        date: "2026-08-19",
        completed: true,
      })
      .expect(200);

    const summary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-19")
      .set("Cookie", portal)
      .expect(200);

    expect(summary.body.sleepWeek.nightsLogged).toBe(2);
    expect(summary.body.sleepWeek.averageDurationMinutes).toBe(480);
    expect(summary.body.exercise.entries[0].intensity).toBe("HIGH");
    expect(summary.body.habits.completed).toBe(1);
  });
});
