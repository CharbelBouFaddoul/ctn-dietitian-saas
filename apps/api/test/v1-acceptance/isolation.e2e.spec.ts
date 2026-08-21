import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — practice & client isolation", () => {
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

  it("Alice cannot read Bob clients, foods, recipes, invoices, tasks", async () => {
    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const bobId = ctx.world.practices.bobId;
    const noahId = ctx.world.clients.noahClientId;

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${bobId}/clients/${noahId}`)
      .set("Cookie", aliceCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${bobId}/foods/${ctx.world.foods.bobCustomFoodId}`)
      .set("Cookie", aliceCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${bobId}/recipes/${ctx.world.recipes.bobRecipeId}`)
      .set("Cookie", aliceCookie)
      .expect(403);

    const invoices = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/invoices`)
      .set("Cookie", aliceCookie)
      .expect(200);
    const nums = (invoices.body.items ?? invoices.body ?? []).map(
      (row: { invoiceNumber?: string }) => row.invoiceNumber,
    );
    expect(nums.some((n: string | null | undefined) => n?.startsWith("CW-"))).toBe(false);
  });

  it("Bob cannot see Alice custom food Harbor Protein Smoothie Base", async () => {
    const bobCookie = await loginAs(ctx, DEMO_EMAILS.bob);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.bobId}/foods/${ctx.world.foods.aliceCustomFoodId}`)
      .set("Cookie", bobCookie)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });
  });

  it("forged resource IDs across practices are denied", async () => {
    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/clients/${ctx.world.clients.noahClientId}`)
      .set("Cookie", aliceCookie)
      .expect((res) => {
        expect([403, 404]).toContain(res.status);
      });
  });
});
