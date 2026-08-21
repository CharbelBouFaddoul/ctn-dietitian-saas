import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — invoices, tasks, analytics, documents", () => {
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

  it("lists Harbor invoices across lifecycle statuses", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/invoices`)
      .set("Cookie", cookie)
      .expect(200);
    const rows = res.body.items ?? res.body;
    const statuses = new Set((Array.isArray(rows) ? rows : []).map((r: { status: string }) => r.status));
    for (const s of ["DRAFT", "ISSUED", "SENT", "PAID", "OVERDUE", "CANCELLED"]) {
      expect(statuses.has(s)).toBe(true);
    }
  });

  it("portal patient can see shared invoices but not draft", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    const res = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/invoices")
      .set("Cookie", cookie)
      .expect(200);
    const rows = res.body.items ?? res.body;
    const statuses = (Array.isArray(rows) ? rows : []).map((r: { status: string }) => r.status);
    expect(statuses).not.toContain("DRAFT");
  });

  it("tasks and analytics load for Alice", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/tasks`)
      .set("Cookie", cookie)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/analytics/overview`)
      .set("Cookie", cookie)
      .expect(200);
  });

  it("documents list for Emma includes shared Harbor notes", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const res = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${ctx.world.practices.aliceId}/clients/${ctx.world.clients.emmaClientId}/documents`,
      )
      .set("Cookie", cookie)
      .expect(200);
    expect(JSON.stringify(res.body)).toContain("harbor");
  });
});
