import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { CLIENT_ACCESS_DENIED } from "../src/clients/client.messages";
import { ORGANIZATION_ACCESS_DENIED, ORGANIZATION_UNAVAILABLE } from "../src/organizations/tenant.types";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";
import { MULTI_MEMBER_UNSUPPORTED } from "../src/organizations/organization.service";

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
    await activateStandardSubscription(ctx.prisma, created.body.id);
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

  it("blocks other dietitians from accessing another account's clients", async () => {
    const owner = await registerVerifyLogin();
    const otherDietitian = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    const add = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: otherDietitian.address, role: "DIETITIAN" });
    expect(add.status).toBe(400);
    expect(add.body.message).toBe(MULTI_MEMBER_UNSUPPORTED);

    const client = await createClient(owner.cookie, org.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}`)
      .set("Cookie", otherDietitian.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.id}/clients/${client.body.id}`)
      .set("Cookie", otherDietitian.cookie)
      .send({ firstName: "Blocked" })
      .expect(403);
  });

  it("blocks clients from accessing another client's data", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Portal Clinic");
    const clientA = await createClient(owner.cookie, org.id);
    const clientB = await createClient(owner.cookie, org.id);
    const portalA = await connectClientPortal(ctx, owner.cookie, org.id, clientA.body);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${clientB.body.id}/conversation/messages`)
      .set("Cookie", portalA)
      .expect(403);
  });

  it("does not let timeline bypass client authorization", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Timeline Clinic");
    const client = await createClient(owner.cookie, org.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", outsider.cookie)
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
    await connectClientPortal(ctx, owner.cookie, org.id, client.body);
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

  it("blocks dietitian account holders from portal APIs", async () => {
    const owner = await registerVerifyLogin();
    await createOrg(owner.cookie, "Dietitian Portal Block");

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", owner.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/food-logs")
      .set("Cookie", owner.cookie)
      .expect(403);
  });

  it("does not grant access via planted ClientAssignment rows", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Assignment Plant");
    const client = await createClient(owner.cookie, org.id);
    expect(client.status).toBe(201);

    const outsiderUser = await ctx.prisma.user.findFirstOrThrow({
      where: { emailNormalized: outsider.address },
    });
    const fakeMember = await ctx.prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: outsiderUser.id,
        role: "DIETITIAN",
        status: "ACTIVE",
      },
    });
    await ctx.prisma.clientAssignment.create({
      data: {
        organizationId: org.id,
        dietitianAccountId: org.id,
        clientId: client.body.id,
        organizationMemberId: fakeMember.id,
        assignedById: outsiderUser.id,
      },
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}`)
      .set("Cookie", outsider.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}`)
      .set("Cookie", outsider.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(ORGANIZATION_ACCESS_DENIED));
  });

  it("rejects legacy organization id when it differs from DietitianAccount id", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Legacy Bypass");
    const ownerUser = await ctx.prisma.user.findFirstOrThrow({
      where: { emailNormalized: owner.address },
    });

    // Simulate a split DIETITIAN-style account: account id != legacy organization id.
    const legacyOrg = await ctx.prisma.organization.create({
      data: {
        name: "Legacy Only Org",
        slug: `legacy-only-${seq}`,
        status: "ACTIVE",
        createdById: ownerUser.id,
      },
    });
    await ctx.prisma.dietitianAccount.update({
      where: { id: org.id },
      data: { legacyOrganizationId: legacyOrg.id },
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${legacyOrg.id}`)
      .set("Cookie", owner.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(ORGANIZATION_ACCESS_DENIED));

    // Account id still works.
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
  });

  it("returns unavailable for suspended accounts on client list", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Suspend List");
    await ctx.lifecycle.setStatus(org.id, "SUSPENDED");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(ORGANIZATION_UNAVAILABLE));
  });
});
