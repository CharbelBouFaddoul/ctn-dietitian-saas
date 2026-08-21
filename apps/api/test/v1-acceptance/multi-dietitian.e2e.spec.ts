import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — multi-dietitian patient", () => {
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

  it("lists both connections and scopes portal data by activeClientId", async () => {
    const cookie = await loginAs(ctx, DEMO_EMAILS.sharedPatient);

    const connections = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/connections")
      .set("Cookie", cookie)
      .expect(200);
    const clientIds = (connections.body.items ?? connections.body).map(
      (row: { clientId: string }) => row.clientId,
    );
    expect(clientIds).toEqual(
      expect.arrayContaining([
        ctx.world.clients.sharedAliceClientId,
        ctx.world.clients.sharedBobClientId,
      ]),
    );

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", cookie)
      .send({ clientId: ctx.world.clients.sharedAliceClientId })
      .expect(200);

    const alicePlans = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", cookie)
      .expect(200);
    const aliceNames = JSON.stringify(alicePlans.body);
    expect(aliceNames).toMatch(/Harbor|Hypertrophy|Maya/);
    expect(aliceNames).not.toContain("Cut Phase");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", cookie)
      .send({ clientId: ctx.world.clients.sharedBobClientId })
      .expect(200);

    const bobPlans = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", cookie)
      .expect(200);
    const bobNames = JSON.stringify(bobPlans.body);
    expect(bobNames).toMatch(/Cedar|Cut/);
    expect(bobNames).not.toContain("Hypertrophy");
  });

  it("rejects forged activeClientId from another patient", async () => {
    const emmaCookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", emmaCookie)
      .send({ clientId: ctx.world.clients.sharedBobClientId })
      .expect((res) => {
        expect([400, 403, 404]).toContain(res.status);
      });
  });
});
