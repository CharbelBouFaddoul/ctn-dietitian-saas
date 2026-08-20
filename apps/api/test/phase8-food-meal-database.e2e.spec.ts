import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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

describe("phase8 food meal database", () => {
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

  function email(prefix = "p8"): string {
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
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: email("client"),
      })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  async function seedGlobalFood(overrides: { name?: string; sourceFoodId?: string } = {}) {
    const source = await ctx.prisma.foodSource.upsert({
      where: { key: "test-catalog-p8" },
      create: {
        key: "test-catalog-p8",
        name: "Test catalog",
        provider: "Test",
        datasetVersion: "p8-1",
        license: "test",
        attribution: "test",
        importedAt: new Date(),
      },
      update: {},
    });
    const name = overrides.name ?? "Chicken breast";
    return ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: overrides.sourceFoodId ?? `chicken-${seq}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        nameNormalized: name.toLowerCase(),
        category: "Poultry",
        servingDescription: "100 g cooked",
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

  it("searches global foods with catalog origin and calculates via nutrition package", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Clinic A");
    const food = await seedGlobalFood({ name: "Chicken breast" });

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/foods?q=chicken`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body.items.some((row: { id: string; origin: string }) => row.id === food.id && row.origin === "catalog")).toBe(
      true,
    );

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/foods/${food.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(detail.body.origin).toBe("catalog");
    expect(detail.body.effectiveNutrition.energyKcal).toBe(165);

    const calc = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 200, unit: "g" })
      .expect(200);
    expect(calc.body.nutrition.energyKcal).toBe(330);
    expect(calc.body.nutrition.proteinG).toBe(62);
  });

  it("creates updates archives custom foods and isolates across practices and patients", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const practiceA = await createPractice(a.cookie, "Practice A");
    const practiceB = await createPractice(b.cookie, "Practice B");
    await seedGlobalFood({ name: "Brown rice" });

    const created = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/foods`)
      .set("Cookie", a.cookie)
      .send({
        name: "Clinic granola mix",
        category: "Custom",
        servingDescription: "1 scoop",
        referenceQuantity: 40,
        referenceUnit: "g",
        energyKcal: 180,
        proteinG: 6,
        carbohydrateG: 22,
        fatG: 7,
      })
      .expect(201);
    expect(created.body.origin).toBe("custom");
    expect(created.body.dietitianAccountId).toBe(practiceA.id);
    const customId = created.body.id as string;

    const row = await ctx.prisma.food.findUniqueOrThrow({ where: { id: customId } });
    expect(row.dietitianAccountId).toBe(practiceA.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/foods/${customId}`)
      .set("Cookie", a.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.origin).toBe("custom");
        expect(res.body.effectiveNutrition.energyKcal).toBe(180);
      });

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practiceA.id}/foods/${customId}`)
      .set("Cookie", a.cookie)
      .send({ energyKcal: 190, name: "Clinic granola mix v2" })
      .expect(200)
      .expect((res) => {
        expect(res.body.effectiveNutrition.energyKcal).toBe(190);
        expect(res.body.name).toBe("Clinic granola mix v2");
      });

    const searchA = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/foods?q=granola`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(searchA.body.items.some((row: { id: string }) => row.id === customId)).toBe(true);

    const searchB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/foods?q=granola`)
      .set("Cookie", b.cookie)
      .expect(200);
    expect(searchB.body.items.some((row: { id: string }) => row.id === customId)).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/foods/${customId}`)
      .set("Cookie", b.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practiceB.id}/foods/${customId}`)
      .set("Cookie", b.cookie)
      .send({ energyKcal: 1 })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${practiceB.id}/foods/${customId}`)
      .set("Cookie", a.cookie)
      .send({ energyKcal: 1 })
      .expect(403);

    const client = await createClient(a.cookie, practiceA.id);
    const portalCookie = await connectClientPortal(ctx, a.cookie, practiceA.id, client);

    const portalSearch = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/foods?q=granola`)
      .set("Cookie", portalCookie)
      .expect(200);
    expect(portalSearch.body.items.some((row: { id: string }) => row.id === customId)).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/foods/${customId}`)
      .set("Cookie", portalCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/foods/${customId}/archive`)
      .set("Cookie", a.cookie)
      .expect(201)
      .expect((res) => expect(res.body.status).toBe("INACTIVE"));

    const afterArchive = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/foods?q=granola&origin=custom`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(afterArchive.body.items.some((row: { id: string }) => row.id === customId)).toBe(false);
  });

  it("filters by origin and prefers prefix matches", async () => {
    const owner = await registerVerifyLogin();
    const practice = await createPractice(owner.cookie, "Search Clinic");
    await seedGlobalFood({ name: "Apple juice", sourceFoodId: "apple-juice" });
    await seedGlobalFood({ name: "Pineapple", sourceFoodId: "pineapple" });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/foods`)
      .set("Cookie", owner.cookie)
      .send({
        name: "Apple crisp bar",
        referenceQuantity: 50,
        referenceUnit: "g",
        energyKcal: 200,
      })
      .expect(201);

    const all = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/foods?q=apple&origin=all`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(2);
    expect(all.body.items[0].name.toLowerCase().startsWith("apple")).toBe(true);

    const catalog = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/foods?q=apple&origin=catalog`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(catalog.body.items.every((row: { origin: string }) => row.origin === "catalog")).toBe(true);
    expect(catalog.body.items.some((row: { name: string }) => row.name === "Apple crisp bar")).toBe(false);

    const custom = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/foods?origin=custom`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(custom.body.items.length).toBe(1);
    expect(custom.body.items[0].origin).toBe("custom");
  });

  it("supports recipes as reusable meals with food isolation", async () => {
    const a = await registerVerifyLogin(email("ra"));
    const b = await registerVerifyLogin(email("rb"));
    const practiceA = await createPractice(a.cookie, "Recipe A");
    const practiceB = await createPractice(b.cookie, "Recipe B");
    const globalFood = await seedGlobalFood({ name: "Egg whole", sourceFoodId: "egg-1" });

    const custom = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/foods`)
      .set("Cookie", a.cookie)
      .send({
        name: "House spice blend",
        referenceQuantity: 5,
        referenceUnit: "g",
        energyKcal: 15,
        proteinG: 0.5,
      })
      .expect(201);

    const recipe = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/recipes`)
      .set("Cookie", a.cookie)
      .send({ name: "Breakfast scramble", servings: 2, description: "Reusable meal" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${practiceA.id}/recipes/${recipe.body.id}/ingredients`)
      .set("Cookie", a.cookie)
      .send({
        ingredients: [
          { foodId: globalFood.id, quantity: 100, unit: "g" },
          { foodId: custom.body.id, quantity: 5, unit: "g" },
        ],
      })
      .expect(200);

    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/recipes/${recipe.body.id}`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(detail.body.nutrition.ingredients).toHaveLength(2);
    expect(detail.body.nutrition.presentedTotal.energyKcal).toBeGreaterThan(0);

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/recipes?q=scramble`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === recipe.body.id)).toBe(true);

    const dup = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/recipes/${recipe.body.id}/duplicate`)
      .set("Cookie", a.cookie)
      .expect(201);
    expect(dup.body.id).not.toBe(recipe.body.id);

    const recipeB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceB.id}/recipes`)
      .set("Cookie", b.cookie)
      .send({ name: "Other practice meal", servings: 1 })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${practiceB.id}/recipes/${recipeB.body.id}/ingredients`)
      .set("Cookie", b.cookie)
      .send({ ingredients: [{ foodId: custom.body.id, quantity: 5, unit: "g" }] })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/recipes/${recipe.body.id}`)
      .set("Cookie", b.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/recipes/${recipe.body.id}`)
      .set("Cookie", b.cookie)
      .expect(403);

    const client = await createClient(a.cookie, practiceA.id);
    const portalCookie = await connectClientPortal(ctx, a.cookie, practiceA.id, client);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/recipes/${recipe.body.id}`)
      .set("Cookie", portalCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/recipes/${recipe.body.id}/archive`)
      .set("Cookie", a.cookie)
      .expect(201);
  });
});
