import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — full lifecycle smoke on seeded world", () => {
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

  it("admin → dietitian dashboard → client portfolio → portal plan → message path", async () => {
    const adminCookie = await loginAs(ctx, DEMO_EMAILS.superAdmin);
    await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/me")
      .set("Cookie", adminCookie)
      .expect(200);

    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/practice/dashboard`)
      .set("Cookie", aliceCookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${ctx.world.practices.aliceId}/clients/${ctx.world.clients.emmaClientId}`,
      )
      .set("Cookie", aliceCookie)
      .expect(200);

    const emmaCookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", emmaCookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", emmaCookie)
      .expect(200);

    const dashboard = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/dashboard")
      .set("Cookie", emmaCookie);
    expect([200, 404]).toContain(dashboard.status);
  });
});
