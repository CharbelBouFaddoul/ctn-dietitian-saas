import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DEMO_EMAILS,
  createDemoAcceptanceContext,
  loginAs,
  seedAcceptanceWorld,
  type DemoAcceptanceContext,
} from "./helpers";

describe("V1 acceptance — authentication & roles", () => {
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

  it("logs in demo roles and scopes /me", async () => {
    const adminCookie = await loginAs(ctx, DEMO_EMAILS.superAdmin);
    const adminMe = await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(adminMe.body.user.platformRole).toBe("ADMIN");

    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    const aliceMe = await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", aliceCookie)
      .expect(200);
    expect(aliceMe.body.user.email).toBe(DEMO_EMAILS.alice);

    const patientCookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    const patientMe = await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", patientCookie)
      .expect(200);
    expect(patientMe.body.user.email).toBe(DEMO_EMAILS.patients.emma);
  });

  it("denies patients from admin and practice dietitian routes", async () => {
    const patientCookie = await loginAs(ctx, DEMO_EMAILS.patients.emma);
    await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/me")
      .set("Cookie", patientCookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${ctx.world.practices.aliceId}/clients`)
      .set("Cookie", patientCookie)
      .expect(403);
  });

  it("denies dietitians from admin routes", async () => {
    const aliceCookie = await loginAs(ctx, DEMO_EMAILS.alice);
    await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/me")
      .set("Cookie", aliceCookie)
      .expect(403);
  });
});
