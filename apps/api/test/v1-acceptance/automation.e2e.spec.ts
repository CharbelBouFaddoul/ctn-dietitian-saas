import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AutomationSweepService } from "../../src/automation/automation-sweep.service";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — automation", () => {
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

  it("Bob can list automation rules; Alice Standard cannot create", async () => {
    const bobCookie = await loginAs(ctx, DEMO_EMAILS.bob);
    const list = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.bobId}/automations`)
      .set("Cookie", bobCookie)
      .expect(200);
    expect(JSON.stringify(list.body)).toContain("Invoice overdue");

    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${ctx.world.practices.aliceId}/automations`)
      .set("Cookie", aliceCookie)
      .send({
        name: "Should fail",
        triggerType: "TASK_DUE",
        actionType: "CREATE_TASK",
        configuration: {
          recipient: "ASSIGNED_DIETITIAN",
          timing: { daysBefore: 1 },
          taskTitle: "x",
          taskPriority: "LOW",
        },
      })
      .expect(403);
  });

  it("sweep runs without throwing against demo data", async () => {
    const sweep = ctx.app.get(AutomationSweepService);
    await expect(sweep.runSweep()).resolves.toBeDefined();
  });
});
