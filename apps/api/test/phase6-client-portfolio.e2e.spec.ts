import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { CLIENT_LIMIT_REACHED } from "../src/clients/client.messages";
import { SubscriptionLifecycleService } from "../src/entitlements/subscription-lifecycle.service";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  generateJoinCode,
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

describe("phase6 client portfolio", () => {
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

  function email(prefix = "p6"): string {
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

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, organizationId: string, body: Record<string, unknown> = {}) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: email("client"),
        ...body,
      })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  it("isolates portfolio by tenant and returns overview composition", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const orgA = await createOrg(a.cookie, "Practice A");
    const orgB = await createOrg(b.cookie, "Practice B");
    const clientA = await createClient(a.cookie, orgA.id, { firstName: "Ann" });

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", a.cookie)
      .expect(200);

    expect(portfolio.body.client.id).toBe(clientA.id);
    expect(portfolio.body.client.firstName).toBe("Ann");
    expect(portfolio.body).toHaveProperty("profile");
    expect(portfolio.body).toHaveProperty("missing");
    expect(portfolio.body).toHaveProperty("alerts");
    expect(portfolio.body).toHaveProperty("recentTimeline");
    expect(portfolio.body.recentTimeline.length).toBeLessThanOrEqual(8);
    expect(portfolio.body.missing.goals).toBe(true);
    expect(Array.isArray(portfolio.body.quickLinks)).toBe(true);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", b.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/clients/${clientA.id}/portfolio`)
      .set("Cookie", a.cookie)
      .expect(403);
  });

  it("scopes portal profile to active client and changes on switch", async () => {
    const ownerA = await registerVerifyLogin(email("oa"));
    const ownerB = await registerVerifyLogin(email("ob"));
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id, { firstName: "Ann", phone: "111" });
    const clientB = await createClient(ownerB.cookie, orgB.id, { firstName: "Ben", phone: "222" });

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/profile`)
      .set("Cookie", ownerA.cookie)
      .send({ allergies: "Peanuts", lifestyle: "Walks daily" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/profile`)
      .set("Cookie", ownerB.cookie)
      .send({ allergies: "Shellfish", lifestyle: "Swims" })
      .expect(200);

    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA);
    const { code } = await generateJoinCode(ctx, ownerB.cookie, orgB.id, clientB.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    const first = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(first.body.client.id).toBe(clientA.id);
    expect(first.body.client.phone).toBe("111");
    expect(first.body.profile.allergies).toBe("Peanuts");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect(200);

    const second = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(second.body.client.id).toBe(clientB.id);
    expect(second.body.profile.allergies).toBe("Shellfish");
    expect(second.body.client.id).not.toBe(first.body.client.id);
  });

  it("allows READ_ONLY portfolio GET and blocks LOCKED; blocks mutations in READ_ONLY", async () => {
    const owner = await registerVerifyLogin(email("ro"));
    const org = await createOrg(owner.cookie, "RO Practice");
    const client = await createClient(owner.cookie, org.id);

    const periodEnd = new Date(clock.getTime() - 4 * 24 * 60 * 60 * 1000);
    await ctx.prisma.subscription.update({
      where: { dietitianAccountId: org.id },
      data: { status: "ACTIVE", currentPeriodEnd: periodEnd },
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/clients/${client.id}`)
      .set("Cookie", owner.cookie)
      .send({ phone: "999" })
      .expect(403);

    const lockedEnd = new Date(clock.getTime() - 15 * 24 * 60 * 60 * 1000);
    await ctx.prisma.subscription.update({
      where: { dietitianAccountId: org.id },
      data: { currentPeriodEnd: lockedEnd },
    });

    const locked = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(403);
    expect(String(locked.body.message).toLowerCase()).toContain("locked");
  });

  it("paginates timeline separately from portfolio recent slice", async () => {
    const owner = await registerVerifyLogin(email("tl"));
    const org = await createOrg(owner.cookie, "Timeline Practice");
    const client = await createClient(owner.cookie, org.id);

    for (let i = 0; i < 12; i += 1) {
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/dietitian/${org.id}/clients/${client.id}`)
        .set("Cookie", owner.cookie)
        .send({ phone: `100${i}` })
        .expect(200);
    }

    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(portfolio.body.recentTimeline.length).toBeLessThanOrEqual(8);

    const page1 = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/timeline?limit=5`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(page1.body).toHaveLength(5);

    const before = page1.body[page1.body.length - 1].occurredAt as string;
    const page2 = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/dietitian/${org.id}/clients/${client.id}/timeline?limit=5&before=${encodeURIComponent(before)}`,
      )
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(page2.body.length).toBeGreaterThan(0);
    expect(page2.body[0].id).not.toBe(page1.body[0].id);
  });

  it("denies assessment get across tenants and returns assessment for owner", async () => {
    const owner = await registerVerifyLogin(email("as"));
    const other = await registerVerifyLogin(email("asx"));
    const org = await createOrg(owner.cookie, "Assess Practice");
    await createOrg(other.cookie, "Other Practice");
    const client = await createClient(owner.cookie, org.id);

    const templates = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/assessment-templates`)
      .set("Cookie", owner.cookie)
      .expect(200);
    let templateId = templates.body[0]?.id as string | undefined;
    if (!templateId) {
      const created = await request(ctx.app.getHttpServer())
        .post(`/api/v1/dietitian/${org.id}/assessment-templates`)
        .set("Cookie", owner.cookie)
        .send({ name: "Intake", schema: { sections: [] } })
        .expect(201);
      templateId = created.body.id as string;
    }

    const started = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/assessments`)
      .set("Cookie", owner.cookie)
      .send({ templateId })
      .expect(201);

    const got = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/assessments/${started.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(got.body.id).toBe(started.body.id);
    expect(got.body).toHaveProperty("responses");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/assessments/${started.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  it("blocks restore to ACTIVE when CLIENT_LIMIT is reached", async () => {
    const owner = await registerVerifyLogin(email("lim"));
    const org = await createOrg(owner.cookie, "Limit Practice");
    const feature = await ctx.prisma.feature.findUniqueOrThrow({
      where: { key: FEATURE_KEYS.CLIENT_LIMIT },
    });
    await ctx.prisma.featureOverride.upsert({
      where: {
        dietitianAccountId_featureId: {
          dietitianAccountId: org.id,
          featureId: feature.id,
        },
      },
      create: {
        dietitianAccountId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 1,
        reason: "phase6 restore limit test",
      },
      update: { enabled: true, limitValue: 1 },
    });

    const first = await createClient(owner.cookie, org.id, { firstName: "One" });
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${first.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const second = await createClient(owner.cookie, org.id, { firstName: "Two" });

    const blocked = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${first.id}/restore`)
      .set("Cookie", owner.cookie)
      .send({ status: "ACTIVE" })
      .expect(403);
    expect(blocked.body.message).toBe(CLIENT_LIMIT_REACHED);
    expect(second.id).toBeTruthy();
  });
});
