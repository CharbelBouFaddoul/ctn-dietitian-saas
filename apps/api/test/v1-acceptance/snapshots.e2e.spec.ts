import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — meal plan snapshot immutability", () => {
  let ctx: DemoAcceptanceContext;

  beforeAll(async () => {
    ctx = await createDemoAcceptanceContext();
  });

  beforeEach(async () => {
    ctx.world = await seedAcceptanceWorld(ctx);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  it("published version snapshot stays stable after recipe/food mutation", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const before = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${ctx.world.practices.aliceId}/meal-plans/${ctx.world.mealPlans.emmaPublishedPlanId}/versions/${ctx.world.mealPlans.emmaPublishedVersionId}`,
      )
      .set("Cookie", cookie)
      .expect(200);

    expect(before.body.immutable ?? before.body.status === "PUBLISHED").toBeTruthy();
    const snapshotBefore = JSON.stringify(before.body.snapshot);

    await ctx.prisma.recipe.update({
      where: { id: ctx.world.recipes.aliceRecipeId },
      data: { name: "MUTATED Harbor Power Bowl" },
    });
    if (ctx.world.foods.catalogFoodId) {
      await ctx.prisma.food.update({
        where: { id: ctx.world.foods.catalogFoodId },
        data: { energyKcal: 9999 },
      });
    }

    const after = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${ctx.world.practices.aliceId}/meal-plans/${ctx.world.mealPlans.emmaPublishedPlanId}/versions/${ctx.world.mealPlans.emmaPublishedVersionId}`,
      )
      .set("Cookie", cookie)
      .expect(200);

    expect(JSON.stringify(after.body.snapshot)).toBe(snapshotBefore);
    expect(JSON.stringify(after.body.snapshot)).not.toContain("MUTATED");
  });

  it("planned food log nutritionSnapshot remains unchanged after food mutation", async () => {
    const log = await ctx.prisma.foodLog.findFirst({
      where: {
        clientId: ctx.world.clients.emmaClientId,
        sourceType: "PLANNED_MEAL",
      },
    });
    expect(log).toBeTruthy();
    const before = JSON.stringify(log!.nutritionSnapshot);

    if (ctx.world.foods.catalogFoodId) {
      await ctx.prisma.food.update({
        where: { id: ctx.world.foods.catalogFoodId },
        data: { energyKcal: 1 },
      });
    }

    const again = await ctx.prisma.foodLog.findUniqueOrThrow({ where: { id: log!.id } });
    expect(JSON.stringify(again.nutritionSnapshot)).toBe(before);
  });
});
