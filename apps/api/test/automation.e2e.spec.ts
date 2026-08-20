import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { AutomationExecutorService } from "../src/automation/automation-executor.service";
import { AutomationSweepService } from "../src/automation/automation-sweep.service";
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

const TASK_RULE_CONFIG = {
  recipient: "ASSIGNED_DIETITIAN",
  timing: { daysInactive: 3 },
  taskTitle: "Follow up with {{client.displayName}}",
  taskPriority: "HIGH",
};

describe("Phase 12 automation", () => {
  let ctx: AuthTestContext;
  let seq = 0;
  let sweep: AutomationSweepService;
  let executor: AutomationExecutorService;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
    sweep = ctx.app.get(AutomationSweepService);
    executor = ctx.app.get(AutomationExecutorService);
  });

  beforeEach(async () => {
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
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { emailNormalized: address.toLowerCase() } });
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`, userId: user.id };
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

  async function createClient(cookie: string, organizationId: string) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client") })
      .expect(201);
    return res.body as { id: string };
  }

  function createRule(cookie: string, organizationId: string, overrides: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/automations`)
      .set("Cookie", cookie)
      .send({
        name: "Inactive follow-up",
        triggerType: "CLIENT_INACTIVE",
        actionType: "CREATE_TASK",
        configuration: TASK_RULE_CONFIG,
        conditions: { clientStatus: "ACTIVE" },
        ...overrides,
      });
  }

  it("rejects automation management for standard plan and staff", async () => {
    const owner = await registerVerifyLogin();
    const staffEmail = email("staff");
    const standardOrg = await createOrg(owner.cookie, "Standard Org", "standard");
    const proOrg = await createOrg(owner.cookie, "Pro Org", "pro");

    await createRule(owner.cookie, standardOrg.id).expect(403);
    await createRule(owner.cookie, proOrg.id).expect(201);

    await registerVerifyLogin(staffEmail);
    await ctx.memberships.add(proOrg.id, owner.userId, staffEmail, "STAFF");
    const staffLogin = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: staffEmail, password: PASSWORD });
    const staffCookie = `ns_session=${cookieValue(staffLogin.headers["set-cookie"])}`;

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${proOrg.id}/automations`)
      .set("Cookie", staffCookie)
      .expect(403);
  });

  it("isolates automation rules between organizations", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Org A", "pro");
    const orgB = await createOrg(ownerB.cookie, "Org B", "pro");

    const created = await createRule(ownerA.cookie, orgA.id).expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}/automations/${created.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${orgB.id}/automations/${created.body.id}`)
      .set("Cookie", ownerB.cookie)
      .send({ name: "Hacked" })
      .expect(404);
  });

  it("executes inactive-client automation and enforces idempotency", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Automation Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    const ruleRes = await createRule(owner.cookie, org.id).expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/automations/${ruleRes.body.id}/activate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const localDate = "2026-08-18";
    const triggerKey = `client-inactive:${client.id}:${localDate}`;
    const rule = await ctx.prisma.automationRule.findUniqueOrThrow({ where: { id: ruleRes.body.id } });

    await executor.executeCandidate(rule, { triggerKey, clientId: client.id });
    await executor.executeCandidate(rule, { triggerKey, clientId: client.id });

    const runs = await ctx.prisma.automationRun.findMany({ where: { organizationId: org.id } });
    const succeeded = runs.filter((r) => r.status === "SUCCEEDED");
    expect(succeeded).toHaveLength(1);

    const tasks = await ctx.prisma.task.findMany({ where: { organizationId: org.id, clientId: client.id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain("Pat");
  });

  it("skips archived clients and suspended organizations", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Skip Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    const ruleRes = await createRule(owner.cookie, org.id).expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/automations/${ruleRes.body.id}/activate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await ctx.prisma.client.update({ where: { id: client.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    const rule = await ctx.prisma.automationRule.findUniqueOrThrow({ where: { id: ruleRes.body.id } });
    await executor.executeCandidate(rule, {
      triggerKey: `client-inactive:${client.id}:2026-08-18`,
      clientId: client.id,
    });

    let run = await ctx.prisma.automationRun.findFirst({ where: { organizationId: org.id } });
    expect(run?.status).toBe("SKIPPED");

    await ctx.prisma.client.update({ where: { id: client.id }, data: { status: "ACTIVE", archivedAt: null } });
    await ctx.prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    await executor.executeCandidate(rule, {
      triggerKey: `client-inactive:${client.id}:2026-08-19`,
      clientId: client.id,
    });
    run = await ctx.prisma.automationRun.findFirst({
      where: { organizationId: org.id, triggerKey: `client-inactive:${client.id}:2026-08-19` },
    });
    expect(run?.status).toBe("SKIPPED");
    expect(run?.errorCode).toBe("organization_inactive");
  });

  it("rejects unknown template variables and skips cancelled appointments", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Template Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    await createRule(owner.cookie, org.id, {
      configuration: {
        ...TASK_RULE_CONFIG,
        taskTitle: "Bad {{client.secretField}}",
      },
    }).expect(400);

    const appointment = await ctx.prisma.appointment.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        title: "Consult",
        startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
        status: "CANCELLED",
      },
    });

    const ruleRes = await createRule(owner.cookie, org.id, {
      name: "Appointment reminder",
      triggerType: "APPOINTMENT_UPCOMING",
      actionType: "SEND_IN_APP_NOTIFICATION",
      configuration: {
        recipient: "ASSIGNED_DIETITIAN",
        timing: { daysBefore: 1 },
        notificationTitle: "Reminder",
        notificationBody: "Appointment with {{client.firstName}}",
      },
    }).expect(201);

    await ctx.prisma.automationRule.update({ where: { id: ruleRes.body.id }, data: { status: "ACTIVE" } });
    await sweep.runSweep();

    const apptRuns = await ctx.prisma.automationRun.findMany({
      where: { triggerKey: { contains: appointment.id } },
    });
    expect(apptRuns).toHaveLength(0);
  });

  it("respects global automation disable and organization execution limits", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Limit Org", "pro");
    const client = await createClient(owner.cookie, org.id);

    const feature = await ctx.prisma.feature.findUniqueOrThrow({
      where: { key: FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT },
    });
    await ctx.prisma.featureOverride.create({
      data: {
        organizationId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 1,
        reason: "test limit",
        createdById: owner.userId,
      },
    });

    const ruleRes = await createRule(owner.cookie, org.id).expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/automations/${ruleRes.body.id}/activate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const rule = await ctx.prisma.automationRule.findUniqueOrThrow({ where: { id: ruleRes.body.id } });
    await executor.executeCandidate(rule, { triggerKey: `client-inactive:${client.id}:d1`, clientId: client.id });
    await executor.executeCandidate(rule, { triggerKey: `client-inactive:${client.id}:d2`, clientId: client.id });

    const skipped = await ctx.prisma.automationRun.findFirst({
      where: { organizationId: org.id, errorCode: "execution_limit" },
    });
    expect(skipped?.status).toBe("SKIPPED");

    await ctx.prisma.feature.update({ where: { key: FEATURE_KEYS.AUTOMATION }, data: { status: "INACTIVE" } });
    await executor.executeCandidate(rule, { triggerKey: `client-inactive:${client.id}:d3`, clientId: client.id });
    const denied = await ctx.prisma.automationRun.findFirst({
      where: { organizationId: org.id, triggerKey: `client-inactive:${client.id}:d3` },
    });
    expect(denied?.status).toBe("SKIPPED");
    expect(denied?.errorCode).toBe("entitlement_denied");
  });

  it("blocks unauthenticated access and portal users", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Portal Org", "pro");
    const client = await createClient(owner.cookie, org.id);
    const clientEmail = (await ctx.prisma.client.findUniqueOrThrow({ where: { id: client.id } })).email!;
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, { id: client.id, email: clientEmail });

    await request(ctx.app.getHttpServer()).get(`/api/v1/organizations/${org.id}/automations`).expect(401);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/automations`)
      .set("Cookie", portalCookie)
      .expect(403);
  });
});
