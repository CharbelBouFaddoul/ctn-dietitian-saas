import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { dayLabels, weekOfDay } from "../src/meal-plans/meal-plan.service";
import {
  activateStandardSubscription,
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

describe("meal weeks and starter recipes", () => {
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

  function email(prefix = "wk"): string {
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
    return { cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
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
    return res.body as { id: string };
  }

  it("derives week labels from dayNumber", () => {
    expect(weekOfDay(1)).toBe(1);
    expect(weekOfDay(7)).toBe(1);
    expect(weekOfDay(8)).toBe(2);
    expect(weekOfDay(21)).toBe(3);
    expect(dayLabels(1, "NUMBERED").title).toBe("Week 1 · Day 1");
    expect(dayLabels(8, "NUMBERED").title).toBe("Week 2 · Day 1");
    expect(dayLabels(14, "NUMBERED").title).toBe("Week 2 · Day 7");
  });

  it("add week appends 7 sequential days and rejects published mutation", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createPractice(owner.cookie, "Week Clinic");
    const orgB = await createPractice(outsider.cookie, "Other Clinic");
    const client = await createClient(owner.cookie, org.id);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "14-day", dayLabelMode: "NUMBERED" })
      .expect(201);

    const versionId = plan.body.versions[0].id as string;
    expect(plan.body.versions[0]).toBeTruthy();

    // create starts with 1 day — add 6 days → week 1 complete, then add week → weeks 2
    for (let i = 0; i < 6; i += 1) {
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}/days`)
        .set("Cookie", owner.cookie)
        .send({})
        .expect(201);
    }

    let version = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(version.body.snapshot.days).toHaveLength(7);
    expect(version.body.snapshot.days.map((d: { dayNumber: number }) => d.dayNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);

    version = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}/weeks`)
      .set("Cookie", owner.cookie)
      .expect(201);
    expect(version.body.snapshot.days).toHaveLength(14);
    expect(version.body.snapshot.days[7].title).toContain("Week 2");
    expect(version.body.snapshot.days.map((d: { dayNumber: number }) => d.dayNumber)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );

    version = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}/weeks`)
      .set("Cookie", owner.cookie)
      .expect(201);
    expect(version.body.snapshot.days).toHaveLength(21);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/meal-plans/${plan.body.id}/versions/${versionId}/weeks`)
      .set("Cookie", outsider.cookie)
      .expect(404);

    const source = await ctx.prisma.foodSource.upsert({
      where: { key: "usda-fdc-foundation-curated" },
      update: {},
      create: {
        key: "usda-fdc-foundation-curated",
        name: "USDA",
        provider: "USDA",
        datasetVersion: "test",
        license: "public domain",
        attribution: "test",
        importedAt: new Date(),
      },
    });
    const food = await ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: `week-food-${Date.now()}`,
        dietitianAccountId: null,
        name: "Test food",
        nameNormalized: "test food",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 100,
        proteinG: 10,
        carbohydrateG: 10,
        fatG: 1,
        importedAt: new Date(),
      },
    });
    const mealId = version.body.snapshot.days[0].meals[0].id as string;
    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${mealId}/items`,
      )
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${versionId}/weeks`)
      .set("Cookie", owner.cookie)
      .expect(400);
  });

  it("exposes starter recipes to all practices and blocks mutation", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const orgA = await createPractice(ownerA.cookie, "Practice A");
    const orgB = await createPractice(ownerB.cookie, "Practice B");

    const source = await ctx.prisma.foodSource.upsert({
      where: { key: "usda-fdc-foundation-curated" },
      update: {},
      create: {
        key: "usda-fdc-foundation-curated",
        name: "USDA",
        provider: "USDA",
        datasetVersion: "test",
        license: "public domain",
        attribution: "test",
        importedAt: new Date(),
      },
    });
    const food = await ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: "test-chicken",
        dietitianAccountId: null,
        name: "Chicken breast",
        nameNormalized: "chicken breast",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        importedAt: new Date(),
      },
    });
    const starter = await ctx.prisma.recipe.create({
      data: {
        dietitianAccountId: null,
        sourceKey: "usda-myplate-kitchen-starter",
        sourceRecipeId: "test-starter-chicken",
        name: "Starter chicken bowl",
        servings: 1,
        ingredients: {
          create: [
            {
              dietitianAccountId: null,
              foodId: food.id,
              quantity: 100,
              unit: "g",
              sortOrder: 0,
            },
          ],
        },
      },
    });
    const practiceRecipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/recipes`)
      .set("Cookie", ownerA.cookie)
      .send({ name: "A only meal", servings: 1 })
      .expect(201);

    const listA = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/recipes`)
      .set("Cookie", ownerA.cookie)
      .expect(200);
    expect(listA.body.items.some((r: { id: string }) => r.id === starter.id)).toBe(true);
    expect(listA.body.items.some((r: { id: string }) => r.id === practiceRecipe.body.id)).toBe(true);
    expect(listA.body.items.find((r: { id: string }) => r.id === starter.id).origin).toBe("starter");
    expect(listA.body.items.find((r: { id: string }) => r.id === starter.id).readOnly).toBe(true);

    const listB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/recipes`)
      .set("Cookie", ownerB.cookie)
      .expect(200);
    expect(listB.body.items.some((r: { id: string }) => r.id === starter.id)).toBe(true);
    expect(listB.body.items.some((r: { id: string }) => r.id === practiceRecipe.body.id)).toBe(false);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}/recipes/${starter.id}`)
      .set("Cookie", ownerA.cookie)
      .send({ name: "Hacked" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/recipes/${starter.id}/archive`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/recipes/${practiceRecipe.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(404);

    const client = await createClient(ownerA.cookie, orgA.id);
    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/meal-plans`)
      .set("Cookie", ownerA.cookie)
      .send({ clientId: client.id, name: "With starter" })
      .expect(201);
    const versionId = plan.body.versions[0].id as string;
    const dayId = (
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/dietitian/${orgA.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
        .set("Cookie", ownerA.cookie)
        .expect(200)
    ).body.snapshot.days[0].id as string;
    const mealId = (
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/dietitian/${orgA.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
        .set("Cookie", ownerA.cookie)
        .expect(200)
    ).body.snapshot.days[0].meals[0].id as string;

    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/dietitian/${orgA.id}/meal-plans/${plan.body.id}/versions/${versionId}/meals/${mealId}/items`,
      )
      .set("Cookie", ownerA.cookie)
      .send({ itemType: "RECIPE", recipeId: starter.id, quantity: 1, unit: "serving" })
      .expect(201);

    const published = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/meal-plans/${plan.body.id}/versions/${versionId}/publish`)
      .set("Cookie", ownerA.cookie)
      .expect(201);
    const item = published.body.snapshot.days[0].meals[0].items[0];
    expect(item.recipe.id).toBe(starter.id);
    expect(item.presented.energyKcal).toBeTruthy();

    await ctx.prisma.recipe.update({
      where: { id: starter.id },
      data: { name: "Renamed after publish" },
    });
    const frozen = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/meal-plans/${plan.body.id}/versions/${versionId}`)
      .set("Cookie", ownerA.cookie)
      .expect(200);
    expect(frozen.body.snapshot.days[0].meals[0].items[0].recipe.name).toBe("Starter chicken bowl");
    expect(dayId).toBeTruthy();
  });
});
