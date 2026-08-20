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

describe("phase9 meal plans composition nutrition", () => {
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

  function email(prefix = "p9"): string {
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

  async function seedGlobalFood(name = "Chicken breast") {
    const source = await ctx.prisma.foodSource.upsert({
      where: { key: "p9-test-catalog" },
      create: {
        key: "p9-test-catalog",
        name: "P9 catalog",
        provider: "Test",
        datasetVersion: "1",
        license: "test",
        attribution: "test",
        importedAt: new Date(),
      },
      update: {},
    });
    return ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: `${name}-${seq}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        nameNormalized: name.toLowerCase(),
        category: "Protein",
        servingDescription: "100 g",
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
        dietitianAccountId: null,
      },
    });
  }

  function firstDay(version: {
    snapshot: {
      days: Array<{
        id: string;
        presented: { energyKcal: number | null };
        meals: Array<{
          id: string;
          name: string;
          presented: { energyKcal: number | null };
          items: Array<{
            id: string;
            food?: { id: string; origin?: string } | null;
            presented: { energyKcal: number | null };
          }>;
        }>;
      }>;
    };
  }) {
    const day = version.snapshot.days[0];
    if (!day) throw new Error("missing day");
    return day;
  }

  it("creates meals with food and recipe items and returns aggregated nutrition", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Clinic A");
    const client = await createClient(owner.cookie, practice.id);
    const food = await seedGlobalFood("Egg white");
    const bread = await seedGlobalFood("Whole wheat bread");

    const custom = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/foods`)
      .set("Cookie", owner.cookie)
      .send({
        name: "House salsa",
        referenceQuantity: 30,
        referenceUnit: "g",
        energyKcal: 20,
        proteinG: 0.5,
        carbohydrateG: 4,
        fatG: 0.2,
        fiberG: 1,
      })
      .expect(201);

    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/recipes`)
      .set("Cookie", owner.cookie)
      .send({ name: "Yogurt bowl", servings: 1 })
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

    let version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const day = firstDay(version.body);

    const snack = await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/days/${day.id}/meals`,
      )
      .set("Cookie", owner.cookie)
      .send({ name: "Morning Snack" })
      .expect(201);
    version = snack;
    const snackMeal = firstDay(version.body).meals.find((m: { name: string }) => m.name === "Morning Snack");
    expect(snackMeal).toBeTruthy();

    const breakfast = firstDay(version.body).meals.find((m: { name: string }) => m.name === "Breakfast")!;

    version = await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: bread.id, quantity: 100, unit: "g" })
      .expect(201);

    version = await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: custom.body.id, quantity: 30, unit: "g" })
      .expect(201);

    version = await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "RECIPE", recipeId: recipe.body.id, quantity: 1, unit: "serving" })
      .expect(201);

    const meal = firstDay(version.body).meals.find((m) => m.name === "Breakfast")!;
    expect(meal.items).toHaveLength(3);
    expect(meal.items.some((i) => i.food?.origin === "catalog")).toBe(true);
    expect(meal.items.some((i) => i.food?.origin === "custom")).toBe(true);
    expect(meal.presented.energyKcal).toBeGreaterThan(0);

    const itemSum = meal.items.reduce((sum, row) => sum + (row.presented.energyKcal ?? 0), 0);
    expect(meal.presented.energyKcal).toBe(itemSum);

    const breadItem = meal.items.find((i) => i.food?.id === bread.id)!;
    version = await request(ctx.app.getHttpServer())
      .patch(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/items/${breadItem.id}`,
      )
      .set("Cookie", owner.cookie)
      .send({ quantity: 200, unit: "g" })
      .expect(200);

    const updatedMeal = firstDay(version.body).meals.find((m) => m.name === "Breakfast")!;
    expect(updatedMeal.presented.energyKcal).toBeGreaterThan(meal.presented.energyKcal!);

    const dayNutrition = firstDay(version.body).presented.energyKcal;
    const mealsSum = firstDay(version.body).meals.reduce(
      (sum, row) => sum + (row.presented.energyKcal ?? 0),
      0,
    );
    expect(dayNutrition).toBe(mealsSum);
  });

  it("isolates custom foods and recipes across practices and patients", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const practiceA = await createPractice(a.cookie, "Practice A");
    const practiceB = await createPractice(b.cookie, "Practice B");
    const clientA = await createClient(a.cookie, practiceA.id);
    const clientB = await createClient(b.cookie, practiceB.id);

    const customA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/foods`)
      .set("Cookie", a.cookie)
      .send({ name: "Secret mix", referenceQuantity: 10, referenceUnit: "g", energyKcal: 50 })
      .expect(201);

    const recipeA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/recipes`)
      .set("Cookie", a.cookie)
      .send({ name: "Private bowl", servings: 1 })
      .expect(201);

    const planB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceB.id}/meal-plans`)
      .set("Cookie", b.cookie)
      .send({ clientId: clientB.id, name: "B plan" })
      .expect(201);
    const versionBId = planB.body.versions.find((v: { status: string }) => v.status === "DRAFT").id as string;
    const versionB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/meal-plans/${planB.body.id}/versions/${versionBId}`)
      .set("Cookie", b.cookie)
      .expect(200);
    const breakfastB = firstDay(versionB.body).meals[0]!;

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practiceB.id}/meal-plans/${planB.body.id}/versions/${versionBId}/meals/${breakfastB.id}/items`,
      )
      .set("Cookie", b.cookie)
      .send({ itemType: "FOOD", foodId: customA.body.id, quantity: 10, unit: "g" })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practiceB.id}/meal-plans/${planB.body.id}/versions/${versionBId}/meals/${breakfastB.id}/items`,
      )
      .set("Cookie", b.cookie)
      .send({ itemType: "RECIPE", recipeId: recipeA.body.id, quantity: 1, unit: "serving" })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/meal-plans`)
      .set("Cookie", b.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    const planA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/meal-plans`)
      .set("Cookie", a.cookie)
      .send({ clientId: clientA.id, name: "A plan" })
      .expect(201);
    const portalA = await connectClientPortal(ctx, a.cookie, practiceA.id, clientA);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/meal-plans/${planA.body.id}`)
      .set("Cookie", portalA)
      .expect(403);
  });

  it("publishes immutable snapshot and portal shows composition with nutrition", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Publish Clinic");
    const client = await createClient(owner.cookie, practice.id);
    const food = await seedGlobalFood("Oats");

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "Portal plan" })
      .expect(201);
    const versionId = plan.body.versions.find((v: { status: string }) => v.status === "DRAFT").id as string;
    let version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast = firstDay(version.body).meals.find((m: { name: string }) => m.name === "Breakfast")!;

    version = await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);

    const publishedKcal = firstDay(version.body).meals.find((m: { name: string }) => m.name === "Breakfast")!
      .presented.energyKcal;

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${practice.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 999 })
      .expect(200);

    const frozen = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(frozen.body.immutable).toBe(true);
    const frozenMeal = firstDay(frozen.body).meals.find((m: { name: string }) => m.name === "Breakfast")!;
    expect(frozenMeal.presented.energyKcal).toBe(publishedKcal);
    expect(frozenMeal.presented.energyKcal).not.toBe(999);

    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);
    const portal = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(portal.body.plan).toBeTruthy();
    expect(portal.body.plan.snapshot.days[0].meals[0].items.length).toBeGreaterThan(0);
    expect(portal.body.plan.snapshot.days[0].meals[0].presented.energyKcal).toBe(publishedKcal);
    expect(portal.body.plan.snapshot.days[0].presented.energyKcal).toBeGreaterThan(0);

    const other = await registerVerifyLogin(email("other"));
    const otherPractice = await createPractice(other.cookie, "Other");
    const otherClient = await createClient(other.cookie, otherPractice.id);
    const otherPortal = await connectClientPortal(ctx, other.cookie, otherPractice.id, otherClient);
    const otherView = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", otherPortal)
      .expect(200);
    expect(otherView.body.plan).toBeNull();
  });

  it("labels days as Day N or weekdays based on plan dayLabelMode", async () => {
    const owner = await registerVerifyLogin(email("labels"));
    const practice = await createPractice(owner.cookie, "Label practice");
    const client = await createClient(owner.cookie, practice.id);

    const numbered = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "Numbered plan", dayLabelMode: "NUMBERED" })
      .expect(201);
    expect(numbered.body.dayLabelMode).toBe("NUMBERED");
    const numberedVersionId = numbered.body.versions.find((v: { status: string }) => v.status === "DRAFT")
      .id as string;
    let version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${numbered.body.id}/versions/${numberedVersionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(version.body.snapshot.days[0].title).toBe("Day 1");
    expect(version.body.snapshot.dayLabelMode).toBe("NUMBERED");

    version = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans/${numbered.body.id}/versions/${numberedVersionId}/days`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);
    expect(version.body.snapshot.days.map((d: { title: string }) => d.title)).toEqual(["Day 1", "Day 2"]);

    const weekdayPlan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "Weekday plan", dayLabelMode: "WEEKDAY" })
      .expect(201);
    expect(weekdayPlan.body.dayLabelMode).toBe("WEEKDAY");
    const weekdayVersionId = weekdayPlan.body.versions.find((v: { status: string }) => v.status === "DRAFT")
      .id as string;
    version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${weekdayPlan.body.id}/versions/${weekdayVersionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(version.body.snapshot.days[0].title).toBe("Monday");
    expect(version.body.snapshot.days[0].weekday).toBe("Monday");

    version = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/meal-plans/${weekdayPlan.body.id}/versions/${weekdayVersionId}/days`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);
    expect(version.body.snapshot.days.map((d: { title: string }) => d.title)).toEqual([
      "Monday",
      "Tuesday",
    ]);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practice.id}/meal-plans/${weekdayPlan.body.id}`)
      .set("Cookie", owner.cookie)
      .send({ dayLabelMode: "NUMBERED" })
      .expect(200);
    version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/meal-plans/${weekdayPlan.body.id}/versions/${weekdayVersionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(version.body.snapshot.days.map((d: { title: string }) => d.title)).toEqual(["Day 1", "Day 2"]);
    expect(version.body.snapshot.dayLabelMode).toBe("NUMBERED");
  });
});
