import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import {
  SUBSCRIPTION_LOCKED,
  SUBSCRIPTION_READ_ONLY,
} from "../src/entitlements/subscription.messages";
import { SubscriptionLifecycleService } from "../src/entitlements/subscription-lifecycle.service";
import { CLIENT_LIMIT_REACHED } from "../src/clients/client.messages";
import {
  activateSubscription,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";

const PASSWORD = "ValidPass12";
const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("phase4 subscription lifecycle", () => {
  let ctx: AuthTestContext;
  let lifecycle: SubscriptionLifecycleService;
  let seq = 0;
  let clock = new Date("2026-08-20T12:00:00.000Z");

  beforeAll(async () => {
    ctx = await createAuthTestApp();
    lifecycle = ctx.app.get(SubscriptionLifecycleService);
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
    clock = new Date("2026-08-20T12:00:00.000Z");
    lifecycle.setClock(() => new Date(clock.getTime()));
  });

  afterAll(async () => {
    lifecycle?.resetClock();
    await ctx?.app.close();
  });

  function email(prefix = "p4"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email()) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: PASSWORD })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: PASSWORD })
      .expect(200);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: address.toLowerCase() },
    });
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`, id: user.id };
  }

  async function makeAdmin() {
    const session = await registerVerifyLogin(email("admin"));
    await ctx.prisma.user.update({
      where: { id: session.id },
      data: { platformRole: "SUPER_ADMIN" },
    });
    return session;
  }

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    return created.body as { id: string; name: string };
  }

  function advanceDays(days: number) {
    clock = new Date(clock.getTime() + days * 24 * 60 * 60 * 1000);
  }

  it("assigns Standard/Pro/Premium to the correct DietitianAccount", async () => {
    const admin = await makeAdmin();
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Plan Clinic");
    const plans = await ctx.prisma.plan.findMany({ where: { status: "ACTIVE" } });
    const bySlug = Object.fromEntries(plans.map((p) => [p.slug, p]));

    for (const slug of ["trial", "standard", "pro"] as const) {
      const assigned = await request(ctx.app.getHttpServer())
        .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
        .set("Cookie", admin.cookie)
        .send({ planId: bySlug[slug]!.id, status: "ACTIVE" })
        .expect(200);
      expect(assigned.body.plan.slug).toBe(slug);
      expect(assigned.body.accessState).toBe("ACTIVE");
    }

    const row = await ctx.prisma.subscription.findUniqueOrThrow({
      where: { dietitianAccountId: org.id },
    });
    expect(row.dietitianAccountId).toBe(org.id);
    expect(row.planId).toBe(bySlug.pro!.id);
  });

  it("enforces CLIENT_LIMIT and does not delete clients on downgrade", async () => {
    const admin = await makeAdmin();
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Limit Clinic");
    const standard = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "standard" } });
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: standard.id, status: "ACTIVE" })
      .expect(200);

    const feature = await ctx.prisma.feature.findUniqueOrThrow({
      where: { key: FEATURE_KEYS.CLIENT_LIMIT },
    });
    await ctx.prisma.featureOverride.upsert({
      where: {
        dietitianAccountId_featureId: { dietitianAccountId: org.id, featureId: feature.id },
      },
      create: {
        dietitianAccountId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 2,
        reason: "test seat cap",
      },
      update: { enabled: true, limitValue: 2, reason: "test seat cap" },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "A", lastName: "One", email: email("c") })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "B", lastName: "Two", email: email("c") })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "C", lastName: "Three", email: email("c") })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_LIMIT_REACHED));

    await ctx.prisma.featureOverride.update({
      where: {
        dietitianAccountId_featureId: { dietitianAccountId: org.id, featureId: feature.id },
      },
      data: { limitValue: 1 },
    });

    const count = await ctx.prisma.client.count({
      where: { dietitianAccountId: org.id, status: { in: ["PENDING", "ACTIVE"] } },
    });
    expect(count).toBe(2);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200)
      .expect((res) => expect(res.body.items.length).toBeGreaterThanOrEqual(2));
  });

  it("derives GRACE, READ_ONLY, LOCKED from currentPeriodEnd and blocks mutations", async () => {
    const admin = await makeAdmin();
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Lifecycle Clinic");
    const plan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } });
    const periodEnd = new Date(clock);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd.toISOString(),
      })
      .expect(200);

    advanceDays(1);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/subscription-access`)
      .set("Cookie", owner.cookie)
      .expect(200)
      .expect((res) => expect(res.body.accessState).toBe("GRACE"));

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "Grace", lastName: "Ok", email: email("g") })
      .expect(201);

    advanceDays(3);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/subscription-access`)
      .set("Cookie", owner.cookie)
      .expect(200)
      .expect((res) => expect(res.body.accessState).toBe("READ_ONLY"));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "Ro", lastName: "Blocked", email: email("ro") })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(SUBSCRIPTION_READ_ONLY));

    advanceDays(7);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(SUBSCRIPTION_LOCKED));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/subscription-access`)
      .set("Cookie", owner.cookie)
      .expect(200)
      .expect((res) => expect(res.body.accessState).toBe("LOCKED"));

    const clientsBefore = await ctx.prisma.client.count({ where: { dietitianAccountId: org.id } });
    expect(clientsBefore).toBeGreaterThanOrEqual(1);

    const renewEnd = new Date(clock.getTime() + 30 * 24 * 60 * 60 * 1000);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/admin/dietitians/${org.id}/subscription/renew`)
      .set("Cookie", admin.cookie)
      .send({ currentPeriodEnd: renewEnd.toISOString() })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/subscription-access`)
      .set("Cookie", owner.cookie)
      .expect(200)
      .expect((res) => expect(res.body.accessState).toBe("ACTIVE"));

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "Back", lastName: "Active", email: email("ba") })
      .expect(201);

    expect(await ctx.prisma.client.count({ where: { dietitianAccountId: org.id } })).toBe(
      clientsBefore + 1,
    );
  });

  it("isolates subscription lock across dietitian accounts", async () => {
    const admin = await makeAdmin();
    const ownerA = await registerVerifyLogin(email("ownA"));
    const ownerB = await registerVerifyLogin(email("ownB"));
    const orgA = await createOrg(ownerA.cookie, "Clinic A Locked");
    const orgB = await createOrg(ownerB.cookie, "Clinic B Active");
    const plan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "standard" } });

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${orgA.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(clock.getTime() - 11 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(200);
    await activateSubscription(ctx.prisma, orgB.id, "standard");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients`)
      .set("Cookie", ownerA.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(SUBSCRIPTION_LOCKED));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/clients`)
      .set("Cookie", ownerB.cookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${orgA.id}/subscription`)
      .set("Cookie", ownerA.cookie)
      .send({ planId: plan.id })
      .expect(403);
  });
});
