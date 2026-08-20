import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
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

describe("phase11 tracking completion habits meal logging", () => {
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

  function email(prefix = "p11"): string {
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
        key: `p11-src-${seq}-${name}`,
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
        proteinG: 10,
        carbohydrateG: 20,
        fatG: 5,
        fiberG: 2,
        sugarG: 1,
        sodiumMg: 2,
        importedAt: new Date(),
      },
    });
  }

  async function publishBreakfastWithFoodAndRecipe(
    cookie: string,
    practiceId: string,
    clientId: string,
    foodId: string,
  ) {
    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceId}/recipes`)
      .set("Cookie", cookie)
      .send({ name: "Bowl", servings: 1 })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${practiceId}/recipes/${recipe.body.id}/ingredients`)
      .set("Cookie", cookie)
      .send({ ingredients: [{ foodId, quantity: 100, unit: "g" }] })
      .expect(200);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceId}/meal-plans`)
      .set("Cookie", cookie)
      .send({ clientId, name: "Week 1" })
      .expect(201);
    const versionId = plan.body.versions.find((v: { status: string }) => v.status === "DRAFT").id as string;

    const version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceId}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", cookie)
      .expect(200);
    const breakfast = version.body.snapshot.days[0].meals.find((m: { name: string }) => m.name === "Breakfast")!;

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practiceId}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", cookie)
      .send({ itemType: "FOOD", foodId, quantity: 150, unit: "g" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practiceId}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", cookie)
      .send({ itemType: "RECIPE", recipeId: recipe.body.id, quantity: 1, unit: "serving" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceId}/meal-plans/${plan.body.id}/versions/${versionId}/publish`)
      .set("Cookie", cookie)
      .expect(201);

    return { planId: plan.body.id as string, recipeId: recipe.body.id as string, versionId };
  }

  it("logs planned food+recipe meal, scales servings, keeps snapshot after recipe change, allows repeats and idempotent retries", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Meal Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const food = await seedFood("Yogurt", 100);
    const portal = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    const { recipeId } = await publishBreakfastWithFoodAndRecipe(
      owner.cookie,
      practice.id,
      client.id,
      food.id,
    );

    const portalPlan = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portal)
      .expect(200);
    const meal = portalPlan.body.plan.snapshot.days[0].meals.find(
      (m: { name: string }) => m.name === "Breakfast",
    );
    const mealId = meal.id as string;
    const baseKcal = meal.presented.energyKcal as number;

    const full = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portal)
      .send({ mealId, servings: 1, date: "2026-08-20" })
      .expect(201);
    expect(full.body.createdCount).toBe(1);
    expect(full.body.created[0].sourceType).toBe("PLANNED_MEAL");
    expect(full.body.created[0].presented.energyKcal).toBe(baseKcal);
    const firstPresented = full.body.created[0].presented.energyKcal;

    const half = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portal)
      .send({ mealId, servings: 0.5, date: "2026-08-20" })
      .expect(201);
    expect(half.body.created[0].presented.energyKcal).toBeCloseTo(baseKcal * 0.5, 0);
    expect(half.body.created[0].id).not.toBe(full.body.created[0].id);

    const requestId = randomUUID();
    const first = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portal)
      .send({ mealId, servings: 1, date: "2026-08-21", clientRequestId: requestId })
      .expect(201);
    const retry = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portal)
      .send({ mealId, servings: 1, date: "2026-08-21", clientRequestId: requestId })
      .expect(201);
    expect(retry.body.created[0].id).toBe(first.body.created[0].id);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${practice.id}/recipes/${recipeId}/ingredients`)
      .set("Cookie", owner.cookie)
      .send({ ingredients: [{ foodId: food.id, quantity: 500, unit: "g" }] })
      .expect(200);

    const afterChange = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/food-logs?date=2026-08-20`)
      .set("Cookie", portal)
      .expect(200);
    const original = afterChange.body.find((row: { id: string }) => row.id === full.body.created[0].id);
    expect(original.presented.energyKcal).toBe(firstPresented);
  });

  it("rejects unpublished meals and foreign meal plans", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const practiceA = await createPractice(ownerA.cookie, "Isolation Clinic A");
    const practiceB = await createPractice(ownerB.cookie, "Isolation Clinic B");
    const clientA = await createClient(ownerA.cookie, practiceA.id);
    const clientB = await createClient(ownerB.cookie, practiceB.id);
    const food = await seedFood("Rice", 130);
    const portalA = await connectClientPortal(ctx, ownerA.cookie, practiceA.id, clientA);
    const portalB = await connectClientPortal(ctx, ownerB.cookie, practiceB.id, clientB);

    const draft = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/meal-plans`)
      .set("Cookie", ownerA.cookie)
      .send({ clientId: clientA.id, name: "Draft only" })
      .expect(201);
    const versionId = draft.body.versions.find((v: { status: string }) => v.status === "DRAFT").id as string;
    const version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/meal-plans/${draft.body.id}/versions/${versionId}`)
      .set("Cookie", ownerA.cookie)
      .expect(200);
    const mealId = version.body.snapshot.days[0].meals[0].id as string;

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portalA)
      .send({ mealId })
      .expect(404);

    await publishBreakfastWithFoodAndRecipe(ownerB.cookie, practiceB.id, clientB.id, food.id);
    const planB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portalB)
      .expect(200);
    const foreignMealId = planB.body.plan.snapshot.days[0].meals[0].id as string;

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/log-planned-meal")
      .set("Cookie", portalA)
      .send({ mealId: foreignMealId })
      .expect(404);
  });

  it("supports habit catalog, assignment, complete/undo, and isolation", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const practiceA = await createPractice(ownerA.cookie, "Habits A");
    const practiceB = await createPractice(ownerB.cookie, "Habits B");
    const clientA = await createClient(ownerA.cookie, practiceA.id);
    const clientB = await createClient(ownerB.cookie, practiceB.id);
    const portalA = await connectClientPortal(ctx, ownerA.cookie, practiceA.id, clientA);

    const created = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/habits`)
      .set("Cookie", ownerA.cookie)
      .send({ name: "Walk 30 min", defaultTargetValue: 30, defaultTargetUnit: "min" })
      .expect(201);
    expect(created.body.scope).toBe("practice");

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practiceA.id}/habits/${created.body.id}`)
      .set("Cookie", ownerA.cookie)
      .send({ description: "Daily walk" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/clients/${clientA.id}/habits`)
      .set("Cookie", ownerA.cookie)
      .send({ habitDefinitionId: created.body.id, targetValue: 30, targetUnit: "min" })
      .expect(201);

    const portalHabits = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/habits?date=2026-08-20")
      .set("Cookie", portalA)
      .expect(200);
    expect(portalHabits.body.habits.some((h: { habitDefinitionId: string }) => h.habitDefinitionId === created.body.id)).toBe(
      true,
    );

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/portal/habits/${created.body.id}/log`)
      .set("Cookie", portalA)
      .send({ date: "2026-08-20", completed: true })
      .expect(200);

    let summary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-20")
      .set("Cookie", portalA)
      .expect(200);
    expect(summary.body.habits.completed).toBe(1);
    expect(summary.body.habits.total).toBeGreaterThanOrEqual(1);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/portal/habits/${created.body.id}/log`)
      .set("Cookie", portalA)
      .send({ date: "2026-08-20", completed: false })
      .expect(200);

    summary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary?date=2026-08-20")
      .set("Cookie", portalA)
      .expect(200);
    expect(summary.body.habits.completed).toBe(0);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/habits`)
      .set("Cookie", ownerA.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceB.id}/clients/${clientB.id}/habits`)
      .set("Cookie", ownerA.cookie)
      .send({ habitDefinitionId: created.body.id })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/portal/habits/${created.body.id}/log`)
      .set("Cookie", portalA)
      .send({ date: "2026-08-20", completed: true, clientId: clientB.id })
      .expect((res) => {
        expect([200, 400]).toContain(res.status);
      });
  });
});
