import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — food / recipe / meal plans", () => {
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

  it("searches catalog foods and returns Alice practice recipe", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const foods = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/foods`)
      .query({ q: "a", pageSize: 20 })
      .set("Cookie", cookie)
      .expect(200);
    expect((foods.body.items ?? foods.body).length).toBeGreaterThan(0);

    const recipe = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/recipes/${ctx.world.recipes.aliceRecipeId}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(recipe.body.name).toContain("Harbor");
  });

  it("portal patient sees published meal plan", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    const plans = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", cookie)
      .expect(200);
    expect(JSON.stringify(plans.body)).toContain("Race Prep");
  });
});
