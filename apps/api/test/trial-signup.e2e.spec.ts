import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { AUTH_MESSAGES } from "../src/auth/auth.messages";
import { SubscriptionLifecycleService } from "../src/entitlements/subscription-lifecycle.service";
import {
  cookieValue,
  createAuthTestApp,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";

const PASSWORD = "ValidPass12";

describe("trial signup and public plans", () => {
  let ctx: AuthTestContext;
  let lifecycle: SubscriptionLifecycleService;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
    lifecycle = ctx.app.get(SubscriptionLifecycleService);
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
    await ctx.prisma.platformSettings.updateMany({
      data: {
        emailVerificationRequired: false,
        trialSignupEnabled: true,
        dietitianRegistrationEnabled: true,
        plansPageEnabled: true,
      },
    });
    lifecycle.resetClock();
  });

  afterAll(async () => {
    lifecycle?.resetClock();
    await ctx?.app.close();
  });

  function email(prefix = "trial"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  it("creates an active 14-day trial practice with sample clients when verification is off", async () => {
    const address = email();
    const response = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: address,
        password: PASSWORD,
        audience: "dietitian",
        clinicName: "Harbor Trial Clinic",
        consents: [
          { type: "TERMS_OF_SERVICE", policyVersion: "1.0" },
          { type: "PRIVACY_POLICY", policyVersion: "1.0" },
        ],
      })
      .expect(200);

    expect(response.body.message).toBe(AUTH_MESSAGES.registerReady);
    expect(response.body.emailVerificationRequired).toBe(false);
    expect(response.body.dietitianAccountId).toBeTruthy();
    const cookie = `ns_session=${cookieValue(response.headers["set-cookie"])}`;
    const dietitianAccountId = response.body.dietitianAccountId as string;

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: address.toLowerCase() },
    });
    expect(user.status).toBe("ACTIVE");
    expect(user.emailVerifiedAt).not.toBeNull();

    const subscription = await ctx.prisma.subscription.findUniqueOrThrow({
      where: { dietitianAccountId },
      include: { plan: true },
    });
    expect(subscription.plan.slug).toBe("trial");
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.trialEndsAt).toBeTruthy();
    expect(subscription.currentPeriodEnd).toBeTruthy();

    const samples = await ctx.prisma.client.findMany({
      where: { dietitianAccountId, isTrialSeed: true, status: "ACTIVE" },
    });
    expect(samples.length).toBe(2);

    const access = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${dietitianAccountId}/subscription-access`)
      .set("Cookie", cookie)
      .expect(200);
    expect(access.body.accessState).toBe("ACTIVE");
    expect(access.body.planSlug).toBe("trial");

    expect(await ctx.entitlements.limit(dietitianAccountId, FEATURE_KEYS.CLIENT_LIMIT)).toBe(10);
    expect(await ctx.entitlements.can(dietitianAccountId, FEATURE_KEYS.AI)).toBe(true);
    expect(await ctx.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(50);

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.user.email.toLowerCase()).toBe(address);
  });

  it("hides trial and inactive premium from the public plans list", async () => {
    const response = await request(ctx.app.getHttpServer()).get("/api/v1/public/plans").expect(200);
    const slugs = (response.body as Array<{ slug: string }>).map((plan) => plan.slug);
    expect(slugs).toEqual(["standard", "pro"]);
    for (const plan of response.body as Array<{ showPrice: boolean; priceCents: number | null }>) {
      expect(plan.showPrice).toBe(false);
      expect(plan.priceCents).toBeNull();
    }
  });

  it("locks the practice after the trial period ends", async () => {
    const address = email("lock");
    const response = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: address,
        password: PASSWORD,
        audience: "dietitian",
        clinicName: "Expired Trial Clinic",
      })
      .expect(200);
    const cookie = `ns_session=${cookieValue(response.headers["set-cookie"])}`;
    const dietitianAccountId = response.body.dietitianAccountId as string;

    const subscription = await ctx.prisma.subscription.findUniqueOrThrow({
      where: { dietitianAccountId },
    });
    const ended = new Date(subscription.currentPeriodEnd!.getTime() + 11 * 24 * 60 * 60 * 1000);
    lifecycle.setClock(() => ended);

    const access = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${dietitianAccountId}/subscription-access`)
      .set("Cookie", cookie)
      .expect(200);
    expect(access.body.accessState).toBe("LOCKED");
  });

  it("archives sample clients on remove", async () => {
    const address = email("seed");
    const response = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: address,
        password: PASSWORD,
        audience: "dietitian",
        clinicName: "Seed Clinic",
      })
      .expect(200);
    const cookie = `ns_session=${cookieValue(response.headers["set-cookie"])}`;
    const dietitianAccountId = response.body.dietitianAccountId as string;

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/trial-seed/remove`)
      .set("Cookie", cookie)
      .expect(201);

    const activeSamples = await ctx.prisma.client.count({
      where: { dietitianAccountId, isTrialSeed: true, status: "ACTIVE" },
    });
    expect(activeSamples).toBe(0);
    const archived = await ctx.prisma.client.count({
      where: { dietitianAccountId, isTrialSeed: true, status: "ARCHIVED" },
    });
    expect(archived).toBe(2);
  });
});
