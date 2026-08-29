import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import {
  activateSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";
import { AiContextService } from "../src/ai/ai-context.service";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";

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
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateSubscription(ctx.prisma, created.body.id, planSlug);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body });
  }

  it("rejects AI when disabled by plan and allows when enabled", async () => {
    const standardOwner = await registerVerifyLogin();
    const proOwner = await registerVerifyLogin();
    const standardOrg = await createOrg(standardOwner.cookie, "Standard Org", "standard");
    const proOrg = await createOrg(proOwner.cookie, "Pro Org", "pro");
    const standardClient = await createClient(standardOwner.cookie, standardOrg.id);
    const proClient = await createClient(proOwner.cookie, proOrg.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${standardOrg.id}/clients/${standardClient.body.id}/ai/client-summary`)
      .set("Cookie", standardOwner.cookie)
      .send({})
      .expect(403);

    const ok = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${proOrg.id}/clients/${proClient.body.id}/ai/client-summary`)
      .set("Cookie", proOwner.cookie)
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
        dietitianAccountId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 1,
        reason: "test cap",
      },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(429);
  });

  it("isolates AI access across dietitian accounts", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Org A", "pro");
    const orgB = await createOrg(ownerB.cookie, "Org B", "pro");

    const clientA = await createClient(ownerA.cookie, orgA.id);
    const clientB = await createClient(ownerB.cookie, orgB.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.body.id}/ai/client-summary`)
      .set("Cookie", ownerA.cookie)
      .send({})
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientB.body.id}/ai/client-summary`)
      .set("Cookie", ownerA.cookie)
      .send({})
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.body.id}/ai/client-summary`)
      .set("Cookie", outsider.cookie)
      .send({})
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));
  });

  it("blocks client portal users from dietitian AI endpoints", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Portal Org", "pro");
    const client = await createClient(owner.cookie, org.id);
    const portal = await connectClientPortal(ctx, owner.cookie, org.id, client.body);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", portal)
      .send({})
      .expect(403);
  });

  it("returns usage from backend and never exposes provider API keys", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Usage Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    const generated = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/meal-plan-assistance`)
      .set("Cookie", owner.cookie)
      .send({ prompt: "Suggest breakfast variety" })
      .expect(201);
    expect(generated.body.draftId).toBeTruthy();

    const drafts = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/drafts`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(drafts.body.items[0].id).toBe(generated.body.draftId);
    expect(drafts.body.items[0].action).toBe("MEAL_PLAN_ASSISTANCE");
    expect(JSON.stringify(drafts.body)).not.toContain("system");

    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/drafts/${generated.body.draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(draft.body.result).toBeTruthy();
    expect(draft.body.userInput).toBe("Suggest breakfast variety");
    expect(JSON.stringify(draft.body)).not.toContain("sk-");

    const again = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/meal-plan-assistance`)
      .set("Cookie", owner.cookie)
      .send({ prompt: "Another breakfast idea", draftId: generated.body.draftId })
      .expect(201);
    expect(again.body.draftId).toBe(generated.body.draftId);

    const threaded = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/drafts/${generated.body.draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(threaded.body.messages).toHaveLength(2);
    expect(threaded.body.messages[1].userInput).toBe("Another breakfast idea");

    const listedAgain = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/drafts`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listedAgain.body.items).toHaveLength(1);
    expect(listedAgain.body.items[0].id).toBe(again.body.draftId);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/dietitian/${org.id}/ai/drafts/${generated.body.draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);

    const outsider = await registerVerifyLogin();
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/drafts`)
      .set("Cookie", outsider.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/drafts/${again.body.draftId}`)
      .set("Cookie", outsider.cookie)
      .expect(403);

    const usage = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/usage`)
      .set("Cookie", owner.cookie)
      .expect(200);

    expect(usage.body.used).toBeGreaterThanOrEqual(1);
    expect(usage.body.requests.used).toBeGreaterThanOrEqual(1);
    expect(usage.body.tokens.used).toBeGreaterThan(0);
    expect(usage.body.costUsd).toBeGreaterThan(0);
    expect(usage.body.byDay.length).toBeGreaterThanOrEqual(1);
    expect(usage.body.byAction.some((row: { action: string }) => row.action === "MEAL_PLAN_ASSISTANCE")).toBe(true);
    expect(JSON.stringify(usage.body)).not.toContain("AI_API_KEY");
    expect(JSON.stringify(usage.body)).not.toContain("sk-");
  });

  it("refunds failed generations and enforces the token budget", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Refund Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({ prompt: "__FORCE_AI_FAIL__" })
      .expect(503);

    const afterFail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/ai/usage`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(afterFail.body.used).toBe(0);
    expect(afterFail.body.tokens.used).toBe(0);

    const tokenFeature = await ctx.prisma.feature.findUniqueOrThrow({ where: { key: FEATURE_KEYS.AI_TOKEN_LIMIT } });
    await ctx.prisma.featureOverride.create({
      data: {
        dietitianAccountId: org.id,
        featureId: tokenFeature.id,
        enabled: true,
        limitValue: 1,
        reason: "token cap",
      },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);

    const blocked = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(429);
    expect(String(blocked.body.message)).toMatch(/token/i);
  });

  it("builds action-specific context and lists admin usage", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Context Org", "pro");
    const other = await createOrg(outsider.cookie, "Other Org", "pro");
    const client = await createClient(owner.cookie, org.id);
    await ctx.prisma.clientProfile.upsert({
      where: { clientId: client.body.id },
      update: {
        allergies: "Peanuts",
        clinicalData: {
          visit: { reason: "Weight management", expectations: "", clinicalAims: "", clinicalAimsNotes: "", other: "" },
          health: { conditions: "Type 2 diabetes", conditionsNotes: "", medication: "Metformin", personalHistory: "", familyHistory: "", other: "" },
          identity: { address: "12 Secret Street", healthNumber: "HN-999", vatNumber: "VAT-1", occupation: "", workplace: "", processNumber: "", nationalNumber: "", country: "", zipCode: "" },
          prescription: { energyGoalKcal: 1800, macro: { proteinPct: 30, carbPct: 40, fatPct: 30 } },
        },
      },
      create: {
        dietitianAccountId: org.id,
        clientId: client.body.id,
        allergies: "Peanuts",
        clinicalData: {
          visit: { reason: "Weight management" },
          health: { conditions: "Type 2 diabetes", medication: "Metformin" },
          identity: { address: "12 Secret Street", healthNumber: "HN-999" },
          prescription: { energyGoalKcal: 1800, macro: { proteinPct: 30 } },
        },
      },
    });
    const template = await ctx.prisma.assessmentTemplate.create({
      data: {
        dietitianAccountId: org.id,
        name: "Intake eval",
        schema: {
          sections: [
            {
              id: "main",
              questions: [{ id: "gi", type: "TEXT", label: "GI symptoms this week", active: true }],
            },
          ],
        },
      },
    });
    await ctx.prisma.assessment.create({
      data: {
        dietitianAccountId: org.id,
        clientId: client.body.id,
        templateId: template.id,
        templateVersion: 1,
        status: "COMPLETED",
        completedAt: new Date(),
        schemaSnapshot: template.schema ?? undefined,
        responses: { gi: "Bloating after dairy" },
      },
    });
    const user = await ctx.prisma.user.findFirstOrThrow({
      where: { emailNormalized: owner.address.toLowerCase() },
    });
    const tenant = {
      userId: user.id,
      dietitianAccountId: org.id,
      displayName: "Context Org",
      accountStatus: "ACTIVE" as const,
    };
    const contexts = ctx.app.get(AiContextService);
    const message = await contexts.buildMessageContext(tenant, client.body.id);
    const meal = await contexts.buildMealPlanContext(tenant, client.body.id);
    const summary = await contexts.buildSummaryContext(tenant, client.body.id);
    expect(message).not.toHaveProperty("activeMealPlan");
    expect(JSON.stringify(message)).not.toContain('"items"');
    expect(JSON.stringify(summary.clinical)).toContain("Type 2 diabetes");
    expect(JSON.stringify(summary.clinical)).toContain("1800");
    expect(JSON.stringify(meal.profile)).toContain("Peanuts");
    expect(JSON.stringify(summary.evaluations)).toContain("GI symptoms this week");
    expect(JSON.stringify(summary.evaluations)).toContain("Bloating after dairy");
    expect(JSON.stringify({ message, meal, summary })).not.toMatch(/Secret Street|HN-999|VAT-1|emergencyContact/);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/message-draft`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(201);

    await ctx.prisma.user.update({ where: { id: user.id }, data: { platformRole: "SUPER_ADMIN" } });
    const adminUsage = await request(ctx.app.getHttpServer())
      .get(`/api/v1/admin/dietitians/${org.id}/ai/usage`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(adminUsage.body.requests.used).toBeGreaterThanOrEqual(1);
    expect(adminUsage.body.tokens).toBeTruthy();

    const platform = await request(ctx.app.getHttpServer())
      .get(`/api/v1/admin/ai/usage`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(platform.body.items.some((row: { dietitianAccountId: string }) => row.dietitianAccountId === org.id)).toBe(
      true,
    );
    expect(platform.body.items.some((row: { dietitianAccountId: string }) => row.dietitianAccountId === other.id)).toBe(
      false,
    );
  });

  it("rejects globally inactive AI feature", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Global Off", "premium");
    const client = await createClient(owner.cookie, org.id);
    await ctx.prisma.feature.update({ where: { key: FEATURE_KEYS.AI }, data: { status: "INACTIVE" } });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(403);
  });
});
