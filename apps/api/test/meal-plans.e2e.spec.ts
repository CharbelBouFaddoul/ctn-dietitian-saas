import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
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

describe("Phase 7 recipes and meal plans", () => {
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
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string; name: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body });
  }

  async function seedFood(name = "Chicken breast") {
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: `src-${seq}-${name}`,
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
        category: "Poultry",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        fiberG: 0,
        sugarG: 0,
        sodiumMg: 74,
        importedAt: new Date(),
      },
    });
  }

  function breakfastMeal(version: { snapshot: { days: Array<{ meals: Array<{ id: string; name: string }> }> } }) {
    const meal = version.snapshot.days[0]?.meals.find((row) => row.name === "Breakfast") ?? version.snapshot.days[0]?.meals[0];
    if (!meal) throw new Error("Missing breakfast meal");
    return meal;
  }

  it("isolates recipes and uses effective food values", async () => {
    const alice = await registerVerifyLogin();
    const bob = await registerVerifyLogin();
    const orgA = await createOrg(alice.cookie, "Clinic A");
    const orgB = await createOrg(bob.cookie, "Clinic B");
    const food = await seedFood();

    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/recipes`)
      .set("Cookie", alice.cookie)
      .send({ name: "Chicken Bowl", servings: 2 })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${orgA.id}/recipes/${recipe.body.id}/ingredients`)
      .set("Cookie", alice.cookie)
      .send({ ingredients: [{ foodId: food.id, quantity: 200, unit: "g" }] })
      .expect(200)
      .expect((res) => {
        expect(res.body.nutrition.total.energyKcal).toBe(330);
        expect(res.body.nutrition.perServing.energyKcal).toBe(165);
      });

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${orgA.id}/foods/${food.id}/override`)
      .set("Cookie", alice.cookie)
      .send({ energyKcal: 180 })
      .expect(200);

    const recalculated = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/recipes/${recipe.body.id}`)
      .set("Cookie", alice.cookie)
      .expect(200);
    expect(recalculated.body.nutrition.total.energyKcal).toBe(360);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/recipes/${recipe.body.id}`)
      .set("Cookie", bob.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}/recipes/${recipe.body.id}`)
      .set("Cookie", bob.cookie)
      .send({ name: "Hacked" })
      .expect(403);

    const bobRecipe = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/recipes`)
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(bobRecipe.body.items).toHaveLength(0);
  });

  it("publishes immutable snapshots that survive food and recipe changes", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Practice");

    const client = await createClient(owner.cookie, org.id, { firstName: "Assigned" });
    const otherClient = await createClient(owner.cookie, org.id, { firstName: "Other" });

    const food = await seedFood();
    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/recipes`)
      .set("Cookie", owner.cookie)
      .send({ name: "Pancakes", servings: 2 })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/recipes/${recipe.body.id}/ingredients`)
      .set("Cookie", owner.cookie)
      .send({ ingredients: [{ foodId: food.id, quantity: 100, unit: "g" }] })
      .expect(200);

    const otherPlan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: otherClient.body.id, name: "Other plan" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", outsider.cookie)
      .send({ clientId: otherClient.body.id, name: "Denied" })
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${otherPlan.body.id}`)
      .set("Cookie", outsider.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.body.id, name: "Week 1" })
      .expect(201);
    const draftId = plan.body.versions[0].id as string;
    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast = breakfastMeal(draft.body);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 150, unit: "g" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "RECIPE", recipeId: recipe.body.id, quantity: 2, unit: "serving" })
      .expect(201);

    const beforePublish = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const foodItem = beforePublish.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "FOOD");
    const recipeItem = beforePublish.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "RECIPE");
    expect(foodItem.nutrition.energyKcal).toBeCloseTo(247.5, 5);
    expect(recipeItem.nutrition.energyKcal).toBe(165);
    expect(beforePublish.body.snapshot.days[0].meals[0].nutrition.energyKcal).toBeCloseTo(412.5, 5);
    expect(beforePublish.body.snapshot.days[0].nutrition.energyKcal).toBeCloseTo(412.5, 5);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 180 })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/recipes/${recipe.body.id}/ingredients`)
      .set("Cookie", owner.cookie)
      .send({ ingredients: [{ foodId: food.id, quantity: 300, unit: "g" }] })
      .expect(200);

    const published = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(published.body.status).toBe("PUBLISHED");
    expect(published.body.immutable).toBe(true);
    const publishedFood = published.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "FOOD");
    const publishedRecipe = published.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "RECIPE");
    expect(publishedFood.nutrition.energyKcal).toBeCloseTo(247.5, 5);
    expect(publishedRecipe.nutrition.energyKcal).toBe(165);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 10, unit: "g" })
      .expect(400);

    const v2 = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions`)
      .set("Cookie", owner.cookie)
      .expect(201);
    expect(v2.body.status).toBe("DRAFT");
    const v2Food = v2.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "FOOD");
    const v2Recipe = v2.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "RECIPE");
    expect(v2Food.nutrition.energyKcal).toBe(270);
    expect(v2Recipe.nutrition.energyKcal).toBe(540);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${v2.body.id}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const v1 = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(v1.body.status).toBe("SUPERSEDED");
    expect(v1.body.snapshot.days[0].meals[0].items.find((row: { itemType: string }) => row.itemType === "FOOD").nutrition.energyKcal).toBeCloseTo(247.5, 5);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}`)
      .set("Cookie", outsider.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/recipes`)
      .set("Cookie", outsider.cookie)
      .send({ name: "Staff recipe", servings: 1 })
      .expect(403);

    const logs = await ctx.prisma.auditLog.findMany({
      where: { action: { in: ["recipe_created", "meal_plan_created", "meal_plan_published", "meal_plan_version_superseded"] } },
    });
    expect(logs.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(logs)).not.toContain(PASSWORD);
    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(false);
  });

  it("lets a client see only their current published plan", async () => {
    const owner = await registerVerifyLogin();
    const otherOwner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    const otherOrg = await createOrg(otherOwner.cookie, "Other");
    const client = await createClient(owner.cookie, org.id);
    const otherClient = await createClient(otherOwner.cookie, otherOrg.id);
    const food = await seedFood();

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.body.id, name: "Client plan" })
      .expect(201);
    const draftId = plan.body.versions[0].id as string;
    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast = breakfastMeal(draft.body);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);

    const portalBefore = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: client.body.email, password: PASSWORD });
    expect(portalBefore.status).not.toBe(200);

    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client.body);

    const draftView = await request(ctx.app.getHttpServer()).get("/api/v1/portal/meal-plan").set("Cookie", portalCookie).expect(200);
    expect(draftView.body.plan).toBeNull();

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const published = await request(ctx.app.getHttpServer()).get("/api/v1/portal/meal-plan").set("Cookie", portalCookie).expect(200);
    expect(published.body.plan.name).toBe("Client plan");
    expect(published.body.plan.snapshot.days[0].meals[0].items[0].nutrition.energyKcal).toBe(165);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}`)
      .set("Cookie", portalCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}`)
      .set("Cookie", otherOwner.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}`)
      .set("Cookie", otherOwner.cookie)
      .send({ name: "Hacked" })
      .expect(403);
    const otherPlans = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${otherOrg.id}/meal-plans`)
      .set("Cookie", otherOwner.cookie)
      .expect(200);
    expect(otherPlans.body.items).toHaveLength(0);

    const otherCookie = await connectClientPortal(ctx, otherOwner.cookie, otherOrg.id, otherClient.body);
    const otherPortal = await request(ctx.app.getHttpServer()).get("/api/v1/portal/meal-plan").set("Cookie", otherCookie).expect(200);
    expect(otherPortal.body.plan).toBeNull();
  });

  it("rejects empty publishes and archived recipes on new items", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    const client = await createClient(owner.cookie, org.id);
    const food = await seedFood();
    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/recipes`)
      .set("Cookie", owner.cookie)
      .send({ name: "Old", servings: 1 })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/recipes/${recipe.body.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.body.id, name: "Empty" })
      .expect(201);
    const draftId = plan.body.versions[0].id as string;
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(400);

    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast = breakfastMeal(draft.body);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "RECIPE", recipeId: recipe.body.id, quantity: 1, unit: "serving" })
      .expect(400);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);

    const unknownFiber = await ctx.prisma.food.create({
      data: {
        foodSourceId: food.foodSourceId,
        sourceFoodId: `fiber-null-${seq}`,
        name: "Unknown fiber food",
        nameNormalized: "unknown fiber food",
        category: "Other",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 100,
        proteinG: 0,
        carbohydrateG: 0,
        fatG: 0,
        fiberG: null,
        sugarG: 0,
        sodiumMg: 0,
        importedAt: new Date(),
      },
    });
    const calculated = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 33.3, unit: "g" })
      .expect(201);
    const decimalItem = calculated.body.snapshot.days[0].meals[0].items.find(
      (row: { quantity: number }) => row.quantity === 33.3,
    );
    expect(decimalItem.nutrition.energyKcal).toBeCloseTo(54.945, 5);
    const ounce = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 1, unit: "oz" })
      .expect(201);
    const ounceItem = ounce.body.snapshot.days[0].meals[0].items.find((row: { unit: string }) => row.unit === "oz");
    expect(ounceItem.nutrition.energyKcal).toBeCloseTo(46.77671315625, 8);
    const withNull = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: unknownFiber.id, quantity: 50, unit: "g" })
      .expect(201);
    expect(withNull.body.snapshot.days[0].nutrition.fiberG).toBeNull();
    expect(withNull.body.snapshot.days[0].nutrition.energyKcal).toBeGreaterThan(0);
  });
});
