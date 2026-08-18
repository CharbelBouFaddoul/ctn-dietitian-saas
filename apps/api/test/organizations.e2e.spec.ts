import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ORGANIZATION_ACCESS_DENIED, ORGANIZATION_UNAVAILABLE } from "../src/organizations/tenant.types";
import {
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

  it("creates an organization with the creator as OWNER and unique membership", async () => {
    const owner = await registerVerifyLogin();
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Clinic A", settings: SETTINGS });

    expect(created.status).toBe(201);
    expect(created.body.role).toBe("OWNER");
    expect(created.body.status).toBe("ACTIVE");
    expect(created.body.settings.timezone).toBe("UTC");

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

  it("lets a user belong to multiple organizations without cross-access", async () => {
    const user = await registerVerifyLogin();
    const orgA = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", user.cookie)
      .send({ name: "Org A", settings: SETTINGS })
      .expect(201);
    const orgB = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", user.cookie)
      .send({ name: "Org B", settings: SETTINGS })
      .expect(201);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/organizations")
      .set("Cookie", user.cookie)
      .expect(200);
    expect(listed.body).toHaveLength(2);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${orgA.body.id}`)
      .set("Cookie", user.cookie)
      .send({ name: "Org A renamed" })
      .expect(200);

    const stillB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.body.id}`)
      .set("Cookie", user.cookie)
      .expect(200);
    expect(stillB.body.name).toBe("Org B");
  });

  it("blocks Organization A from reading or updating Organization B", async () => {
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

  it("rejects users without membership and ignores guessed organization IDs", async () => {
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
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Role Forge", settings: SETTINGS, role: "SUPER_ADMIN", platformRole: "ADMIN" })
      .expect(400);

    expect(created.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/should not exist/i)]));

    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Role Forge", settings: SETTINGS })
      .expect(201);
    expect(org.body.role).toBe("OWNER");

    const addAdmin = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: "x@example.com", role: "SUPER_ADMIN" });
    expect(addAdmin.status).toBe(400);

    const addClient = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: "x@example.com", role: "CLIENT" });
    expect(addClient.status).toBe(400);
  });

  it("enforces membership uniqueness and deactivated memberships", async () => {
    const owner = await registerVerifyLogin();
    const staff = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Members Org", settings: SETTINGS })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: staff.address, role: "STAFF" })
      .expect(201);

    const duplicate = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: staff.address, role: "DIETITIAN" });
    expect(duplicate.status).toBe(409);

    const members = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const staffMember = members.body.find((row: { email: string }) => row.email === staff.address);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members/${staffMember.id}/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const blocked = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}`)
      .set("Cookie", staff.cookie);
    expect(blocked.status).toBe(403);
  });

  it("allows DIETITIAN and STAFF to read but not manage the organization", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const staff = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Roles Org", settings: SETTINGS })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: staff.address, role: "STAFF" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}`)
      .set("Cookie", dietitian.cookie)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/settings`)
      .set("Cookie", staff.cookie)
      .expect(200);

    const dietitianUpdate = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${org.body.id}/settings`)
      .set("Cookie", dietitian.cookie)
      .send({ ...SETTINGS, locale: "fr-LB" });
    expect(dietitianUpdate.status).toBe(403);

    const staffArchive = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/archive`)
      .set("Cookie", staff.cookie);
    expect(staffArchive.status).toBe(403);
  });

  it("blocks PENDING, SUSPENDED, and ARCHIVED organizations from normal access", async () => {
    const owner = await registerVerifyLogin();
    const pending = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Pending Org", settings: SETTINGS })
      .expect(201);
    await ctx.lifecycle.setStatus(pending.body.id, "PENDING");
    const pendingAccess = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${pending.body.id}`)
      .set("Cookie", owner.cookie);
    expect(pendingAccess.status).toBe(403);
    expect(pendingAccess.body.message).toBe(ORGANIZATION_UNAVAILABLE);

    const suspended = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Suspended Org", settings: SETTINGS })
      .expect(201);
    await ctx.lifecycle.setStatus(suspended.body.id, "SUSPENDED");
    const suspendedAccess = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/organizations/${suspended.body.id}/settings`)
      .set("Cookie", owner.cookie)
      .send(SETTINGS);
    expect(suspendedAccess.status).toBe(403);

    const archived = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Archived Org", settings: SETTINGS })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${archived.body.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);
    const archivedAccess = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${archived.body.id}`)
      .set("Cookie", owner.cookie);
    expect(archivedAccess.status).toBe(403);
  });

  it("protects the last OWNER and rejects unauthorized ownership transfer", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Owner Safety", settings: SETTINGS })
      .expect(201);

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

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const afterAdd = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}/members`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const dietitianMember = afterAdd.body.find((row: { email: string }) => row.email === dietitian.address);

    const unauthorized = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/transfer-ownership`)
      .set("Cookie", dietitian.cookie)
      .send({ membershipId: dietitianMember.id });
    expect(unauthorized.status).toBe(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.body.id}/transfer-ownership`)
      .set("Cookie", owner.cookie)
      .send({ membershipId: dietitianMember.id })
      .expect(201);

    const transferred = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.body.id}`)
      .set("Cookie", dietitian.cookie)
      .expect(200);
    expect(transferred.body.role).toBe("OWNER");
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
