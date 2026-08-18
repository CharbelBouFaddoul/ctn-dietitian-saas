import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { CLIENT_ACCESS_DENIED } from "../src/clients/client.messages";
import {
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

describe("Phase 11 AI assistance", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_PROVIDER = "mock";
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  function email(prefix = "user"): string {
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
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  async function createOrg(cookie: string, name: string, planSlug: "standard" | "pro" | "premium" = "pro") {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    const plan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: planSlug } });
    await ctx.prisma.subscription.create({
      data: { organizationId: created.body.id, planId: plan.id, status: "ACTIVE" },
    });
    return created.body as { id: string };
  }

  async function createClient(cookie: string, organizationId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body });
  }

  async function portalLogin(clientEmail: string) {
    const inviteMail = ctx.emails.messages.find(
      (message) => message.text.includes("CLIENT_INVITE") && message.to === clientEmail,
    );
    const token = extractEmailedToken(inviteMail?.text ?? "");
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/invitations/accept").send({ token, password: PASSWORD }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: clientEmail, password: PASSWORD })
      .expect(200);
    return `ns_session=${cookieValue(login.headers["set-cookie"])}`;
  }

  it("rejects AI when disabled by plan and allows when enabled", async () => {
    const owner = await registerVerifyLogin();
    const standardOrg = await createOrg(owner.cookie, "Standard Org", "standard");
    const proOrg = await createOrg(owner.cookie, "Pro Org", "pro");
    const standardClient = await createClient(owner.cookie, standardOrg.id);
    const proClient = await createClient(owner.cookie, proOrg.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${standardOrg.id}/clients/${standardClient.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(403);

    const ok = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${proOrg.id}/clients/${proClient.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);

    expect(ok.body.result.overview).toBeTruthy();
    expect(ok.body.disclaimer).toContain("review");
  });

  it("enforces AI request limits and organization overrides", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Limited Org", "pro");
    const client = await createClient(owner.cookie, org.id);
    const feature = await ctx.prisma.feature.findUniqueOrThrow({ where: { key: FEATURE_KEYS.AI_REQUEST_LIMIT } });
    await ctx.prisma.featureOverride.create({
      data: {
        organizationId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 1,
        reason: "test cap",
      },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(429);
  });

  it("isolates AI access across organizations and client assignments", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Org A", "pro");
    const orgB = await createOrg(ownerB.cookie, "Org B", "pro");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${orgA.id}/members`)
      .set("Cookie", ownerA.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const clientA = await createClient(ownerA.cookie, orgA.id);
    const clientB = await createClient(ownerB.cookie, orgB.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${orgB.id}/clients/${clientB.body.id}/ai/client-summary`)
      .set("Cookie", ownerA.cookie)
      .send({})
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}/ai/client-summary`)
      .set("Cookie", ownerA.cookie)
      .send({})
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${orgA.id}/clients/${clientA.body.id}/ai/client-summary`)
      .set("Cookie", dietitian.cookie)
      .send({})
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));
  });

  it("blocks client portal users from dietitian AI endpoints", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Portal Org", "pro");
    const client = await createClient(owner.cookie, org.id, { invitePortal: true });
    const portal = await portalLogin(client.body.email);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", portal)
      .send({})
      .expect(403);
  });

  it("returns usage from backend and never exposes provider API keys", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Usage Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/ai/meal-plan-assistance`)
      .set("Cookie", owner.cookie)
      .send({ prompt: "Suggest breakfast variety" })
      .expect(201);

    const usage = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/ai/usage`)
      .set("Cookie", owner.cookie)
      .expect(200);

    expect(usage.body.used).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(usage.body)).not.toContain("AI_API_KEY");
    expect(JSON.stringify(usage.body)).not.toContain("sk-");
  });

  it("rejects globally inactive AI feature", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Global Off", "premium");
    const client = await createClient(owner.cookie, org.id);
    await ctx.prisma.feature.update({ where: { key: FEATURE_KEYS.AI }, data: { status: "INACTIVE" } });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(403);
  });
});
