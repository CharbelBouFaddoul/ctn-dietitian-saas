import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { CLIENT_ACCESS_DENIED } from "../src/clients/client.messages";
import { ORGANIZATION_ACCESS_DENIED } from "../src/organizations/tenant.types";
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

describe("release-blocking security isolation", () => {
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

  function nextEmail(prefix = "iso"): string {
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
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    const plan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "standard" } });
    await ctx.prisma.subscription.create({
      data: { organizationId: created.body.id, planId: plan.id, status: "ACTIVE" },
    });
    return created.body as { id: string };
  }

  async function createClient(cookie: string, organizationId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: nextEmail("client"), ...body });
  }

  it("blocks cross-organization read and write access", async () => {
    const a = await registerVerifyLogin();
    const b = await registerVerifyLogin();
    const orgA = await createOrg(a.cookie, "Org A");
    const orgB = await createOrg(b.cookie, "Org B");
    const clientB = await createClient(b.cookie, orgB.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}`)
      .set("Cookie", a.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(ORGANIZATION_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${orgB.id}`)
      .set("Cookie", a.cookie)
      .send({ name: "Hijacked" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/clients/${clientB.body.id}`)
      .set("Cookie", a.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));
  });

  it("blocks dietitian access to unassigned clients", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const unassigned = await createClient(owner.cookie, org.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${unassigned.body.id}`)
      .set("Cookie", dietitian.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/clients/${unassigned.body.id}`)
      .set("Cookie", dietitian.cookie)
      .send({ firstName: "Blocked" })
      .expect(403);
  });

  it("blocks clients from accessing another client's data", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Portal Clinic");
    const clientA = await createClient(owner.cookie, org.id, { invitePortal: true });
    const clientB = await createClient(owner.cookie, org.id, { invitePortal: true });

    async function portalCookie(clientEmail: string) {
      const invite = ctx.emails.messages.find((row) => row.to === clientEmail);
      const token = extractEmailedToken(invite?.text ?? "");
      await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/invitations/accept")
        .send({ token, password: PASSWORD })
        .expect(200);
      const login = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: clientEmail, password: PASSWORD })
        .expect(200);
      return `ns_session=${cookieValue(login.headers["set-cookie"])}`;
    }

    const portalA = await portalCookie(clientA.body.email);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${clientB.body.id}/conversation/messages`)
      .set("Cookie", portalA)
      .expect(403);
  });

  it("does not let timeline bypass client authorization", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Timeline Clinic");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const client = await createClient(owner.cookie, org.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", dietitian.cookie)
      .expect(403);
  });

  it("scopes feature overrides to the target organization", async () => {
    const superAdmin = await registerVerifyLogin();
    await ctx.prisma.user.update({ where: { emailNormalized: superAdmin.address }, data: { platformRole: "SUPER_ADMIN" } });
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Ent A");
    const orgB = await createOrg(ownerB.cookie, "Ent B");
    const aiFeature = await ctx.prisma.feature.findUniqueOrThrow({ where: { key: FEATURE_KEYS.AI } });
    expect(aiFeature.key).toBe(FEATURE_KEYS.AI);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/admin/organizations/${orgA.id}/overrides/${FEATURE_KEYS.AI}`)
      .set("Cookie", superAdmin.cookie)
      .send({ enabled: true, limitValue: 99, reason: "Org A test override" })
      .expect(200);

    expect(await ctx.entitlements.can(orgA.id, FEATURE_KEYS.AI)).toBe(true);
    expect(await ctx.entitlements.can(orgB.id, FEATURE_KEYS.AI)).toBe(false);
  });

  it("prevents food overrides from altering global food records", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Food Clinic");
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: "iso-source",
        name: "ISO",
        provider: "Test",
        datasetVersion: "1",
        license: "test",
        attribution: "test",
        importedAt: new Date(),
      },
    });
    const food = await ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: "iso-food",
        name: "Apple",
        nameNormalized: "apple",
        category: "Fruit",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 52,
        proteinG: 0.3,
        carbohydrateG: 14,
        fatG: 0.2,
        fiberG: 2.4,
        sugarG: 10,
        sodiumMg: 1,
        importedAt: new Date(),
      },
    });

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/organizations/${org.id}/foods/${food.id}/override`)
      .set("Cookie", owner.cookie)
      .send({ energyKcal: 99 })
      .expect(200);

    const global = await ctx.prisma.food.findUniqueOrThrow({ where: { id: food.id } });
    expect(Number(global.energyKcal)).toBe(52);
  });

  it("rejects revoked sessions", async () => {
    const session = await registerVerifyLogin();
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/logout").set("Cookie", session.cookie).expect(200);
    await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", session.cookie).expect(401);
  });

  it("blocks archived clients from portal login", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Archive Clinic");
    const client = await createClient(owner.cookie, org.id);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/account/invite`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, password: PASSWORD })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: client.body.email, password: PASSWORD })
      .expect(401);
  });

  it("denies standard plan access to pro-only automation", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Standard Org");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/automations`)
      .set("Cookie", owner.cookie)
      .send({
        name: "Inactive follow-up",
        triggerType: "CLIENT_INACTIVE",
        actionType: "CREATE_TASK",
        configuration: {
          recipient: "ASSIGNED_DIETITIAN",
          timing: { daysInactive: 3 },
          taskTitle: "Follow up",
          taskPriority: "HIGH",
        },
        conditions: { clientStatus: "ACTIVE" },
      })
      .expect(403);
  });
});
