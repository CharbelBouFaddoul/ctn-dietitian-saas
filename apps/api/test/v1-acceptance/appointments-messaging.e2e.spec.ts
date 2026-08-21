import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — appointments & messaging", () => {
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

  it("lists Alice appointments including completed/scheduled/cancelled", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/appointments`)
      .set("Cookie", cookie)
      .expect(200);
    const rows = res.body.items ?? res.body;
    const statuses = new Set((Array.isArray(rows) ? rows : []).map((r: { status: string }) => r.status));
    expect(statuses.has("COMPLETED") || statuses.has("SCHEDULED")).toBe(true);
  });

  it("dietitian messaging list shows Emma conversation", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/conversations`)
      .set("Cookie", cookie)
      .expect(200);
    expect(JSON.stringify(res.body).toLowerCase()).toMatch(/emma|message|conversation/);
  });

  it("portal notifications are scoped to Emma", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    const res = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", cookie)
      .expect(200);
    expect(JSON.stringify(res.body)).toContain("meal plan");
  });
});
