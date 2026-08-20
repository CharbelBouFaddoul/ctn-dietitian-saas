import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ORGANIZATION_ACCESS_DENIED, ORGANIZATION_UNAVAILABLE } from "../src/organizations/tenant.types";
import { MULTI_MEMBER_UNSUPPORTED } from "../src/organizations/organization.service";
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

describe("organizations and tenant isolation", () => {
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
    return `orguser${seq}@example.com`;
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

  it("creates a dietitian account with the creator as OWNER", async () => {
    const owner = await registerVerifyLogin();
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Clinic A", settings: SETTINGS });

    expect(created.status).toBe(201);
    expect(created.body.role).toBe("OWNER");
    expect(created.body.status).toBe("ACTIVE");
    expect(created.body.settings.timezone).toBe("UTC");
    await activateStandardSubscription(ctx.prisma, created.body.id);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const current = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${created.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(current.body.context.role).toBe("OWNER");
    expect(current.body.context.organizationId).toBe(created.body.id);
  });

  it("allows only one dietitian account per user", async () => {
    const user = await registerVerifyLogin();
    await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", user.cookie)
      .send({ name: "Org A", settings: SETTINGS })
      .expect(201);

    const second = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", user.cookie)
      .send({ name: "Org B", settings: SETTINGS });
    expect(second.status).toBe(409);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/organizations")
      .set("Cookie", user.cookie)
      .expect(200);
    expect(listed.body).toHaveLength(1);
  });

  it("blocks DietitianAccount A from reading or updating DietitianAccount B", async () => {
    const alice = await registerVerifyLogin();
    const bob = await registerVerifyLogin();
    const orgA = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", alice.cookie)
      .send({ name: "Alice Org", settings: SETTINGS })
      .expect(201);
    const orgB = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", bob.cookie)
      .send({ name: "Bob Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, orgA.body.id);
    await activateStandardSubscription(ctx.prisma, orgB.body.id);

    const read = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.body.id}`)
      .set("Cookie", alice.cookie);
    expect(read.status).toBe(403);
    expect(read.body.message).toBe(ORGANIZATION_ACCESS_DENIED);

    const update = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${orgB.body.id}`)
      .set("Cookie", alice.cookie)
      .send({ name: "Hijacked" });
    expect(update.status).toBe(403);

    const settings = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${orgB.body.id}/settings`)
      .set("Cookie", alice.cookie)
      .send({ ...SETTINGS, timezone: "Europe/Paris" });
    expect(settings.status).toBe(403);

    const stillBob = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.body.id}`)
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(stillBob.body.name).toBe("Bob Org");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.body.id}`)
      .set("Cookie", alice.cookie)
      .expect(200);
  });

  it("rejects users without ownership and ignores guessed account IDs", async () => {
    const outsider = await registerVerifyLogin();
    const guessed = "11111111-1111-4111-8111-111111111111";
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${guessed}`)
      .set("Cookie", outsider.cookie);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(ORGANIZATION_ACCESS_DENIED);
  });

  it("does not let the client supply an organization role or platform role", async () => {
    const owner = await registerVerifyLogin();
    const forged = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Role Forge", settings: SETTINGS, role: "SUPER_ADMIN", platformRole: "ADMIN" })
      .expect(400);

    expect(forged.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/should not exist/i)]));

    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Role Forge", settings: SETTINGS })
      .expect(201);
    expect(org.body.role).toBe("OWNER");
    await activateStandardSubscription(ctx.prisma, org.body.id);

    // DTO validation rejects invalid roles before the multi-member gate.
    const addAdmin = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: "x@example.com", role: "SUPER_ADMIN" });
    expect(addAdmin.status).toBe(400);
    expect(addAdmin.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/DIETITIAN|STAFF|must be/i)]));
  });

  it("rejects multi-member practice operations", async () => {
    const owner = await registerVerifyLogin();
    const other = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Members Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, org.body.id);

    const add = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: other.address, role: "STAFF" });
    expect(add.status).toBe(400);
    expect(add.body.message).toBe(MULTI_MEMBER_UNSUPPORTED);

    const members = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0].role).toBe("OWNER");
    expect(members.body[0].email).toBe(owner.address);

    const blocked = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}`)
      .set("Cookie", other.cookie);
    expect(blocked.status).toBe(403);
  });

  it("blocks non-owners from reading another dietitian account", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Roles Org", settings: SETTINGS })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}`)
      .set("Cookie", outsider.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/settings`)
      .set("Cookie", outsider.cookie)
      .expect(403);

    const outsiderUpdate = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.body.id}/settings`)
      .set("Cookie", outsider.cookie)
      .send({ ...SETTINGS, locale: "fr-LB" });
    expect(outsiderUpdate.status).toBe(403);

    const outsiderArchive = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/archive`)
      .set("Cookie", outsider.cookie);
    expect(outsiderArchive.status).toBe(403);
  });

  it("blocks SUSPENDED and ARCHIVED dietitian accounts from normal access", async () => {
    const suspendedOwner = await registerVerifyLogin();
    const suspended = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", suspendedOwner.cookie)
      .send({ name: "Suspended Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, suspended.body.id);
    await ctx.lifecycle.setStatus(suspended.body.id, "SUSPENDED");
    const suspendedAccess = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${suspended.body.id}/settings`)
      .set("Cookie", suspendedOwner.cookie)
      .send(SETTINGS);
    expect(suspendedAccess.status).toBe(403);
    expect(suspendedAccess.body.message).toBe(ORGANIZATION_UNAVAILABLE);

    const suspendedClients = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${suspended.body.id}/clients`)
      .set("Cookie", suspendedOwner.cookie);
    expect(suspendedClients.status).toBe(403);
    expect(suspendedClients.body.message).toBe(ORGANIZATION_UNAVAILABLE);

    const archivedOwner = await registerVerifyLogin();
    const archived = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", archivedOwner.cookie)
      .send({ name: "Archived Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, archived.body.id);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${archived.body.id}/archive`)
      .set("Cookie", archivedOwner.cookie)
      .expect(201);
    const archivedAccess = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${archived.body.id}`)
      .set("Cookie", archivedOwner.cookie);
    expect(archivedAccess.status).toBe(403);
    expect(archivedAccess.body.message).toBe(ORGANIZATION_UNAVAILABLE);
  });

  it("rejects membership role changes and ownership transfer", async () => {
    const owner = await registerVerifyLogin();
    const other = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Owner Safety", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, org.body.id);

    const members = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const ownerMember = members.body.find((row: { role: string }) => row.role === "OWNER");

    const demote = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.body.id}/members/${ownerMember.id}`)
      .set("Cookie", owner.cookie)
      .send({ role: "DIETITIAN" });
    expect(demote.status).toBe(400);
    expect(demote.body.message).toBe(MULTI_MEMBER_UNSUPPORTED);

    // membershipId must be a UUID so validation passes and the multi-member gate runs.
    const transfer = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/transfer-ownership`)
      .set("Cookie", owner.cookie)
      .send({ membershipId: "11111111-1111-4111-8111-111111111111" });
    expect(transfer.status).toBe(400);
    expect(transfer.body.message).toBe(MULTI_MEMBER_UNSUPPORTED);

    // Outsider cannot reach transfer either (tenant denial), independent of multi-member.
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/transfer-ownership`)
      .set("Cookie", other.cookie)
      .send({ membershipId: ownerMember.id })
      .expect(403);
  });

  it("validates organization settings", async () => {
    const owner = await registerVerifyLogin();
    const invalid = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({
        name: "Bad Settings",
        settings: { ...SETTINGS, timezone: "Not/AZone", locale: "nope", currency: "XXX" },
      });
    expect(invalid.status).toBe(400);

    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({
        name: "Good Settings",
        settings: {
          timezone: "Asia/Beirut",
          locale: "en-LB",
          currency: "LBP",
          weightUnit: "kg",
          heightUnit: "cm",
          dateFormat: "DD_MM_YYYY",
        },
      })
      .expect(201);
    expect(org.body.settings.timezone).toBe("Asia/Beirut");
    expect(org.body.settings.locale).toBe("en-LB");
  });
});
