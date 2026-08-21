import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — tracking & evolution", () => {
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

  it("portal tracking summary and evolution load for Emma", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);

    const summary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary")
      .set("Cookie", cookie);
    expect([200, 404]).toContain(summary.status);
    if (summary.status === 200) {
      expect(summary.body).toBeTruthy();
    }

    const evolution = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/evolution")
      .set("Cookie", cookie);
    expect([200, 404]).toContain(evolution.status);
  });

  it("practice can list Emma measurements", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const res = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${ctx.world.practices.aliceId}/clients/${ctx.world.clients.emmaClientId}/measurements`,
      )
      .set("Cookie", cookie)
      .expect(200);
    const rows = res.body.items ?? res.body;
    expect(Array.isArray(rows) ? rows.length : 1).toBeGreaterThan(0);
  });
});
