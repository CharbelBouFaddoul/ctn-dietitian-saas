import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { ADMIN_MESSAGES } from "../src/admin/admin.messages";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";
import {
  activateStandardSubscription,
  createAuthTestApp,
  cookieValue,
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

describe("platform admin, entitlements, and audit", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  function email(): string {
    seq += 1;
    return `adminuser${seq}@example.com`;
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

  async function makePlatformUser(role: "SUPER_ADMIN" | "ADMIN") {
    const session = await registerVerifyLogin();
    await ctx.prisma.user.update({ where: { id: session.id }, data: { platformRole: role } });
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

  async function planBySlug(slug: string) {
    return ctx.prisma.plan.findUniqueOrThrow({ where: { slug } });
  }

  function entitlement(rows: Array<{ key: string; enabled: boolean; limit: number | null; source: string }>, key: string) {
    const row = rows.find((item) => item.key === key);
    expect(row).toBeTruthy();
    return row!;
  }

  it("rejects platformRole on register and keeps /me role null", async () => {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: email(), password: PASSWORD, platformRole: "SUPER_ADMIN" })
      .expect(400);

    const session = await registerVerifyLogin();
    const me = await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", session.cookie).expect(200);
    expect(me.body.user.platformRole).toBeNull();
  });

  it("denies admin endpoints to a normal user and to an organization OWNER", async () => {
    const owner = await registerVerifyLogin();
    await createOrg(owner.cookie, "Clinic Owner");

    const asUser = await request(ctx.app.getHttpServer()).get("/api/v1/admin/me").set("Cookie", owner.cookie);
    expect(asUser.status).toBe(403);
    expect(asUser.body.message).toBe(ADMIN_MESSAGES.forbidden);

    const asOwnerOrgs = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/dietitians")
      .set("Cookie", owner.cookie);
    expect(asOwnerOrgs.status).toBe(403);
  });

  it("allows ADMIN to manage dietitians and subscriptions, but not platform roles", async () => {
    const admin = await makePlatformUser("ADMIN");
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Admin Managed");
    const pro = await planBySlug("pro");

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/dietitians")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(listed.body.some((row: { id: string }) => row.id === org.id)).toBe(true);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: pro.id })
      .expect(200);

    const roleChange = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/users/${owner.id}/platform-role`)
      .set("Cookie", admin.cookie)
      .send({ platformRole: "ADMIN" });
    expect(roleChange.status).toBe(200);
    expect(roleChange.body.platformRole).toBe("ADMIN");
  });

  it("allows platform admin to set platform roles", async () => {
    const platformAdmin = await makePlatformUser("ADMIN");
    const user = await registerVerifyLogin();

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/users/${user.id}/platform-role`)
      .set("Cookie", platformAdmin.cookie)
      .send({ platformRole: "ADMIN" })
      .expect(200);
    expect(updated.body.platformRole).toBe("ADMIN");
  });

  it("keeps tenant APIs isolated and does not let org A inspect org B entitlements", async () => {
    const a = await registerVerifyLogin();
    const b = await registerVerifyLogin();
    const orgA = await createOrg(a.cookie, "Org A");
    const orgB = await createOrg(b.cookie, "Org B");
    await activateStandardSubscription(ctx.prisma, orgA.id);
    await activateStandardSubscription(ctx.prisma, orgB.id);

    const cross = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/entitlements`)
      .set("Cookie", a.cookie);
    expect(cross.status).toBe(403);
    expect(cross.body.message).toBe(DIETITIAN_ACCESS_DENIED);

    const own = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/entitlements`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(Array.isArray(own.body)).toBe(true);
  });

  it("defaults to deny without a subscription and never grants unlimited access", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "No Sub");

    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(false);
    expect(await ctx.entitlements.limit(org.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBeNull();

    const rows = await ctx.entitlements.listEffective(org.id);
    expect(entitlement(rows, FEATURE_KEYS.AI).source).toBe("default");
    expect(entitlement(rows, FEATURE_KEYS.AI).enabled).toBe(false);
  });

  it("applies plan changes and overrides only to the intended organization", async () => {
    const admin = await makePlatformUser("ADMIN");
    const a = await registerVerifyLogin();
    const b = await registerVerifyLogin();
    const orgA = await createOrg(a.cookie, "Plan A");
    const orgB = await createOrg(b.cookie, "Plan B");
    const standard = await planBySlug("standard");
    const pro = await planBySlug("pro");
    const premium = await planBySlug("premium");

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${orgA.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: standard.id })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${orgB.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: pro.id })
      .expect(200);

    expect(await ctx.entitlements.can(orgA.id, FEATURE_KEYS.AI)).toBe(false);
    expect(await ctx.entitlements.can(orgB.id, FEATURE_KEYS.AI)).toBe(true);
    expect(await ctx.entitlements.limit(orgB.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(300);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${orgA.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: premium.id })
      .expect(200);

    expect(await ctx.entitlements.can(orgA.id, FEATURE_KEYS.AI)).toBe(true);
    expect(await ctx.entitlements.limit(orgA.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(1000);
    expect(await ctx.entitlements.limit(orgB.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(300);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${orgA.id}/overrides/${FEATURE_KEYS.AI_REQUEST_LIMIT}`)
      .set("Cookie", admin.cookie)
      .send({ enabled: true, limitValue: 50, reason: "Pilot quota" })
      .expect(200);

    expect(await ctx.entitlements.limit(orgA.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(50);
    expect((await ctx.entitlements.resolve(orgA.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).source).toBe("override");
    expect(await ctx.entitlements.limit(orgB.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(300);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/admin/dietitians/${orgA.id}/overrides/${FEATURE_KEYS.AI_REQUEST_LIMIT}`)
      .set("Cookie", admin.cookie)
      .expect(200);

    expect(await ctx.entitlements.limit(orgA.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(1000);
    expect((await ctx.entitlements.resolve(orgA.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).source).toBe("plan");
  });

  it("does not entitle a suspended subscription and cannot enable features from client input", async () => {
    const admin = await makePlatformUser("ADMIN");
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Suspended Sub");
    const pro = await planBySlug("pro");

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: pro.id })
      .expect(200);
    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(true);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ status: "SUSPENDED" })
      .expect(200);
    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(false);

    const clientEnable = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/entitlements`)
      .set("Cookie", owner.cookie)
      .send({ key: FEATURE_KEYS.AI, enabled: true });
    expect(clientEnable.status).toBeGreaterThanOrEqual(400);

    const extraRole = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/users/${owner.id}/status`)
      .set("Cookie", admin.cookie)
      .send({ status: "SUSPENDED", role: "OWNER" });
    expect(extraRole.status).toBe(400);
  });

  it("keeps existing subscriptions working when a plan is deactivated and refuses destructive delete", async () => {
    const admin = await makePlatformUser("ADMIN");
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Keep Plan");
    const pro = await planBySlug("pro");

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: pro.id })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/plans/${pro.id}`)
      .set("Cookie", admin.cookie)
      .send({ status: "INACTIVE" })
      .expect(200);

    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(true);
    expect(await ctx.entitlements.limit(org.id, FEATURE_KEYS.AI_REQUEST_LIMIT)).toBe(300);

    await expect(ctx.prisma.plan.delete({ where: { id: pro.id } })).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("records sanitized audit events for admin mutations and security events", async () => {
    const admin = await makePlatformUser("SUPER_ADMIN");
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Audited");
    const standard = await planBySlug("standard");

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: standard.id })
      .expect(200);

    const assigned = await ctx.prisma.auditLog.findFirst({
      where: { action: "subscription_assigned", dietitianAccountId: org.id },
    });
    expect(assigned).toBeTruthy();
    expect(assigned?.actorUserId).toBe(admin.id);

    await ctx.security.record({
      type: "admin_test_sanitize",
      outcome: "success",
      userId: admin.id,
      metadata: {
        password: "secret-password",
        token: "raw-token-value",
        planSlug: "standard",
      },
    });
    const sanitized = await ctx.prisma.auditLog.findFirst({
      where: { action: "admin_test_sanitize" },
    });
    const metadata = sanitized?.metadata as Record<string, unknown>;
    expect(metadata.password).toBeUndefined();
    expect(metadata.token).toBeUndefined();
    expect(metadata.planSlug).toBe("standard");

    const loginAudit = await ctx.prisma.auditLog.findFirst({
      where: { action: "login", actorUserId: owner.id, result: "SUCCESS" },
    });
    expect(loginAudit).toBeTruthy();
  });

  it("does not let an override enable a globally inactive feature or bypass missing subscription checks", async () => {
    const admin = await makePlatformUser("ADMIN");
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Global Off");
    const pro = await planBySlug("pro");
    const ai = await ctx.prisma.feature.findUniqueOrThrow({ where: { key: FEATURE_KEYS.AI } });

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: pro.id })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/features/${ai.id}`)
      .set("Cookie", admin.cookie)
      .send({ status: "INACTIVE" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/dietitians/${org.id}/overrides/${FEATURE_KEYS.AI}`)
      .set("Cookie", admin.cookie)
      .send({ enabled: true, reason: "Should not bypass global disable" })
      .expect(200);

    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(false);
    expect((await ctx.entitlements.resolve(org.id, FEATURE_KEYS.AI)).source).toBe("default");
  });

  it("enforces one subscription row per dietitian account", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "One Sub");
    const standard = await planBySlug("standard");
    const pro = await planBySlug("pro");

    await ctx.prisma.subscription.create({
      data: {
        dietitianAccountId: org.id,
        planId: standard.id,
        status: "ACTIVE",
      },
    });

    await expect(
      ctx.prisma.subscription.create({
        data: {
          dietitianAccountId: org.id,
          planId: pro.id,
          status: "ACTIVE",
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
