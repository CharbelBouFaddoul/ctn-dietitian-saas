import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { PLATFORM_ASSESSMENT_TEMPLATE_ID } from "../src/assessments/platform-template.seed";
import {
  connectClientPortal,
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

describe("§87 end-to-end acceptance workflow", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_PROVIDER = "mock";
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  function nextEmail(prefix = "wf"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = nextEmail()) {
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
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { emailNormalized: address.toLowerCase() } });
    return {
      address,
      id: user.id,
      cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`,
    };
  }

  async function seedFood(name = "Chicken breast") {
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: `wf-src-${seq}`,
        name: "Workflow catalog",
        provider: "Test",
        datasetVersion: "1",
        license: "test",
        attribution: "test",
        importedAt: new Date(),
      },
    });
    return ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: `${name}-${seq}`,
        name,
        nameNormalized: name.toLowerCase(),
        category: "Poultry",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        fiberG: 0,
        sugarG: 0,
        sodiumMg: 74,
        importedAt: new Date(),
      },
    });
  }

  it("runs admin → dietitian → client workflow with audit trail", async () => {
    const admin = await registerVerifyLogin();
    await ctx.prisma.user.update({ where: { id: admin.id }, data: { platformRole: "SUPER_ADMIN" } });

    const dietitian = await registerVerifyLogin(nextEmail("dietitian"));
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", dietitian.cookie)
      .send({ name: "Pro Practice", settings: SETTINGS })
      .expect(201);
    const proPlan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } });
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/organizations/${org.body.id}/subscription`)
      .set("Cookie", admin.cookie)
      .send({ planId: proPlan.id })
      .expect(200);
    expect(await ctx.entitlements.can(org.body.id, FEATURE_KEYS.AI)).toBe(true);

    const client = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients`)
      .set("Cookie", dietitian.cookie)
      .send({ firstName: "Alex", lastName: "Client", email: nextEmail("client") })
      .expect(201);

    const clientCookie = await connectClientPortal(ctx, dietitian.cookie, org.body.id, client.body);

    const assessment = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/assessments`)
      .set("Cookie", dietitian.cookie)
      .send({ templateId: PLATFORM_ASSESSMENT_TEMPLATE_ID })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/assessments/${assessment.body.id}/complete`)
      .set("Cookie", dietitian.cookie)
      .send({ responses: { goal: "energy" } })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/measurements`)
      .set("Cookie", dietitian.cookie)
      .send({ type: "WEIGHT", value: 72.5, unit: "kg", measuredAt: new Date().toISOString() })
      .expect(201);

    const food = await seedFood();
    await request(ctx.app.getHttpServer())
      .put(`/api/v1/organizations/${org.body.id}/foods/${food.id}/override`)
      .set("Cookie", dietitian.cookie)
      .send({ energyKcal: 170 })
      .expect(200);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/meal-plans`)
      .set("Cookie", dietitian.cookie)
      .send({ clientId: client.body.id, name: "Week 1" })
      .expect(201);
    const draftId = plan.body.versions[0].id as string;
    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", dietitian.cookie)
      .expect(200);
    const breakfast = draft.body.snapshot.days[0].meals[0];
    await request(ctx.app.getHttpServer())
      .post(
        `/api/v1/organizations/${org.body.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`,
      )
      .set("Cookie", dietitian.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 120, unit: "g" })
      .expect(201);

    const ai = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/ai/client-summary`)
      .set("Cookie", dietitian.cookie)
      .send({ prompt: "Summarize client readiness" })
      .expect(201);
    expect(ai.body.result.overview).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/meal-plans/${plan.body.id}/versions/${draftId}/publish`)
      .set("Cookie", dietitian.cookie)
      .expect(201);

    const portalPlan = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", clientCookie)
      .expect(200);
    expect(portalPlan.body.plan.name).toBe("Week 1");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", clientCookie)
      .send({ foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", clientCookie)
      .send({ amount: 500, unit: "ml", loggedAt: new Date().toISOString() })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/measurements`)
      .set("Cookie", dietitian.cookie)
      .send({ type: "WEIGHT", value: 72.2, unit: "kg", measuredAt: new Date().toISOString() })
      .expect(201);

    const progress = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/tracking/summary`)
      .set("Cookie", dietitian.cookie)
      .expect(200);
    expect(progress.body.food.logCount).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/conversation/messages`)
      .set("Cookie", dietitian.cookie)
      .send({ body: "Great progress this week." })
      .expect(201);

    const startAt = new Date(Date.now() + 86_400_000).toISOString();
    const endAt = new Date(Date.now() + 86_400_000 + 45 * 60_000).toISOString();
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/appointments`)
      .set("Cookie", dietitian.cookie)
      .send({ title: "Follow-up visit", startAt, endAt })
      .expect(201);

    const invoice = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/invoices`)
      .set("Cookie", dietitian.cookie)
      .send({
        items: [{ description: "Consultation", quantity: 1, unitPrice: 80 }],
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/invoices/${invoice.body.id}/issue`)
      .set("Cookie", dietitian.cookie)
      .expect(201);

    const timeline = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", dietitian.cookie)
      .expect(200);
    expect(timeline.body.length).toBeGreaterThan(0);

    const auditCount = await ctx.prisma.auditLog.count({
      where: { organizationId: org.body.id },
    });
    expect(auditCount).toBeGreaterThan(0);

    const other = await registerVerifyLogin();
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/clients/${client.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });
});
