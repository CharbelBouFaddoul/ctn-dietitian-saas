import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — admin & entitlements", () => {
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

  it("allows SUPER_ADMIN to list plans and dietitians", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.superAdmin);
    const plans = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/plans")
      .set("Cookie", cookie)
      .expect(200);
    const list = Array.isArray(plans.body) ? plans.body : plans.body.items ?? [];
    const slugs = list.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(["standard", "pro", "premium"]));

    await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/me")
      .set("Cookie", cookie)
      .expect(200);
  });

  it("Alice Standard cannot use AI; Bob Pro can (when AI enabled)", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.AI_ENABLED = "true";

    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${ctx.world.practices.aliceId}/clients/${ctx.world.clients.emmaClientId}/ai/client-summary`)
      .set("Cookie", aliceCookie)
      .send({})
      .expect(403);

    const bobCookie = await loginAs(ctx, DEMO_EMAILS.bob);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${ctx.world.practices.bobId}/clients/${ctx.world.clients.noahClientId}/ai/client-summary`)
      .set("Cookie", bobCookie)
      .send({});
    expect([200, 201]).toContain(res.status);
  });
});
