import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";
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

describe("Phase 6 foods and organization overrides", () => {
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
    return created.body as { id: string; name: string };
  }

  async function seedFood(overrides: { fiberG?: number | null; sourceFoodId?: string; name?: string } = {}) {
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: `source-${seq + 1}`,
        name: "Test catalog",
        provider: "Test",
        datasetVersion: "test-1",
        license: "test",
        attribution: "test attribution",
        importedAt: new Date(),
      },
    });
    return ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: overrides.sourceFoodId ?? "chicken-1",
        name: overrides.name ?? "Chicken breast",
        nameNormalized: (overrides.name ?? "Chicken breast").toLowerCase(),
        category: "Poultry",
        servingDescription: "100 g",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        fiberG: overrides.fiberG === undefined ? 0 : overrides.fiberG,
        sugarG: 0,
        sodiumMg: 74,
        importedAt: new Date(),
      },
    });
  }

  it("lets dietitians read global foods but not patch or delete them", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic A");
    const food = await seedFood();

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/foods?q=chicken`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].id).toBe(food.id);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/foods/${food.id}`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 1 })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/dietitian/${org.id}/foods/${food.id}`)
      .set("Cookie", owner.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer()).patch(`/api/v1/foods/${food.id}`).set("Cookie", owner.cookie).send({ energyKcal: 1 }).expect(404);

    const unchanged = await ctx.prisma.food.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(unchanged.energyKcal)).toBe(165);
  });

  it("scopes overrides by organization and restores global values when removed", async () => {
    const alice = await registerVerifyLogin();
    const bob = await registerVerifyLogin();
    const orgA = await createOrg(alice.cookie, "Clinic A");
    const orgB = await createOrg(bob.cookie, "Clinic B");
    const food = await seedFood();

    const created = await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${orgA.id}/foods/${food.id}/override`)
      .set("Cookie", alice.cookie)
      .send({ energyKcal: 180 })
      .expect(200);
    expect(created.body.effectiveNutrition.energyKcal).toBe(180);
    expect(created.body.effectiveNutrition.proteinG).toBe(31);
    expect(created.body.overriddenFields).toEqual(["energyKcal"]);
    expect(created.body.globalNutrition.energyKcal).toBe(165);

    const orgBView = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/foods/${food.id}`)
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(orgBView.body.effectiveNutrition.energyKcal).toBe(165);
    expect(orgBView.body.override).toBeNull();

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/foods/${food.id}/override`)
      .set("Cookie", bob.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${orgA.id}/foods/${food.id}/override`)
      .set("Cookie", bob.cookie)
      .send({ energyKcal: 999 })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${orgB.id}/foods/${food.id}/override`)
      .set("Cookie", alice.cookie)
      .send({ energyKcal: 999 })
      .expect(403);

    const stillGlobal = await ctx.prisma.food.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(stillGlobal.energyKcal)).toBe(165);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/dietitian/${orgA.id}/foods/${food.id}/override`)
      .set("Cookie", alice.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.effectiveNutrition.energyKcal).toBe(165);
        expect(res.body.override).toBeNull();
      });
  });

  it("calculates using effective values, units, nulls, and zeros", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    const food = await seedFood({ fiberG: null });

    const at100 = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 100, unit: "g" })
      .expect(200);
    expect(at100.body.nutrition.energyKcal).toBe(165);
    expect(at100.body.nutrition.fiberG).toBeNull();
    expect(at100.body.nutrition.carbohydrateG).toBe(0);

    const at250 = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 250, unit: "g" })
      .expect(200);
    expect(at250.body.nutrition.energyKcal).toBe(412.5);
    expect(at250.body.presented.energyKcal).toBe(413);
    expect(at250.body.nutrition.fiberG).toBeNull();

    const decimal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 33.3, unit: "g" })
      .expect(200);
    expect(decimal.body.nutrition.energyKcal).toBeCloseTo(54.945, 5);

    const ounces = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 1, unit: "oz" })
      .expect(200);
    expect(ounces.body.nutrition.energyKcal).toBeCloseTo(46.77671315625, 6);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 180 })
      .expect(200);

    const overridden = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 100, unit: "g" })
      .expect(200);
    expect(overridden.body.nutrition.energyKcal).toBe(180);
    expect(overridden.body.nutrition.proteinG).toBe(31);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/foods/${food.id}/calculate`)
      .set("Cookie", owner.cookie)
      .send({ quantity: 100, unit: "ml" })
      .expect(400);
  });

  it("audits override mutations without secrets and keeps search server-side", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");

    const food = await seedFood();

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", outsider.cookie)
      .send({ energyKcal: 180 })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 180, password: "secret" })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 180 })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ proteinG: 40 })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/dietitian/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .expect(200);

    const logs = await ctx.prisma.auditLog.findMany({
      where: { action: { in: ["food_override_created", "food_override_updated", "food_override_removed"] } },
    });
    expect(logs.map((row) => row.action).sort()).toEqual([
      "food_override_created",
      "food_override_removed",
      "food_override_updated",
    ]);
    expect(JSON.stringify(logs)).not.toContain(PASSWORD);
    expect(JSON.stringify(logs)).not.toContain("secret");

    const extra = Array.from({ length: 45 }, (_, index) => ({
      foodSourceId: food.foodSourceId,
      sourceFoodId: `bulk-${index}`,
      name: `Bulk food ${index}`,
      nameNormalized: `bulk food ${index}`,
      referenceQuantity: 100,
      referenceUnit: "g" as const,
      importedAt: new Date(),
    }));
    await ctx.prisma.food.createMany({ data: extra });

    const page = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/foods?page=1&pageSize=20`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(page.body.items).toHaveLength(20);
    expect(page.body.total).toBe(46);

    const started = Date.now();
    const searched = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/foods?q=chicken`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(searched.body.items.some((row: { id: string }) => row.id === food.id)).toBe(true);

    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(false);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/foods`)
      .set("Cookie", owner.cookie)
      .expect(200);
  });

  it("lets platform admins inspect sources without mutating foods", async () => {
    const admin = await registerVerifyLogin();
    await ctx.prisma.user.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });
    const food = await seedFood();

    const sources = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/food-sources")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(sources.body).toHaveLength(1);
    expect(sources.body[0].foodCount).toBe(1);
    expect(sources.body[0].datasetVersion).toBe("test-1");

    const catalog = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/food-sources/foods?q=chicken")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(catalog.body.items.some((row: { id: string }) => row.id === food.id)).toBe(true);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/foods/${food.id}`)
      .set("Cookie", admin.cookie)
      .send({ energyKcal: 1 })
      .expect(404);
  });
});
