import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

const aiEnabled = () => process.env.AI_ENABLED !== "false";

describe.runIf(aiEnabled())("V1 acceptance — AI mock", () => {
  let ctx: DemoAcceptanceContext;

  beforeAll(async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.AI_ENABLED = "true";
    ctx = await createDemoAcceptanceContext();
  });

  beforeEach(async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.AI_ENABLED = "true";
    ctx.world = await seedAcceptanceWorld(ctx);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  it("Bob Pro can request a client summary; portal cannot", async () => {
    const bobCookie = await loginAs(ctx, DEMO_EMAILS.bob);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${ctx.world.practices.bobId}/clients/${ctx.world.clients.noahClientId}/ai/client-summary`)
      .set("Cookie", bobCookie)
      .send({});
    expect([200, 201]).toContain(res.status);

    const patientCookie = await loginAs(ctx, DEMO_EMAILS.patients.noah);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${ctx.world.practices.bobId}/clients/${ctx.world.clients.noahClientId}/ai/client-summary`)
      .set("Cookie", patientCookie)
      .send({})
      .expect(403);
  });
});
