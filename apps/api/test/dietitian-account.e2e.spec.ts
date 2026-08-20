import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { DIETITIAN_ACCESS_DENIED, DIETITIAN_UNAVAILABLE } from "../src/dietitian/dietitian.types";
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

describe("dietitian account create/list/settings/archive", () => {
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
    return `dietitian${seq}@example.com`;
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

  it("creates a dietitian account owned by the creator", async () => {
    const owner = await registerVerifyLogin();
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Clinic A", settings: SETTINGS });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe("ACTIVE");
    expect(created.body.settings.timezone).toBe("UTC");
    expect(created.body.role).toBeUndefined();
    expect(created.body.membershipStatus).toBeUndefined();
    await activateStandardSubscription(ctx.prisma, created.body.id);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const current = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${created.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(current.body.context.dietitianAccountId).toBe(created.body.id);
    expect(current.body.context.displayName).toBe("Clinic A");
    expect(current.body.context.role).toBeUndefined();
  });

  it("allows only one dietitian account per user", async () => {
    const user = await registerVerifyLogin();
    await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", user.cookie)
      .send({ name: "Org A", settings: SETTINGS })
      .expect(201);

    const second = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", user.cookie)
      .send({ name: "Org B", settings: SETTINGS });
    expect(second.status).toBe(409);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/dietitian")
      .set("Cookie", user.cookie)
      .expect(200);
    expect(listed.body).toHaveLength(1);
  });

  it("blocks DietitianAccount A from reading or updating DietitianAccount B", async () => {
    const alice = await registerVerifyLogin();
    const bob = await registerVerifyLogin();
    const orgA = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", alice.cookie)
      .send({ name: "Alice Org", settings: SETTINGS })
      .expect(201);
    const orgB = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", bob.cookie)
      .send({ name: "Bob Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, orgA.body.id);
    await activateStandardSubscription(ctx.prisma, orgB.body.id);

    const read = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.body.id}`)
      .set("Cookie", alice.cookie);
    expect(read.status).toBe(403);
    expect(read.body.message).toBe(DIETITIAN_ACCESS_DENIED);

    const update = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgB.body.id}`)
      .set("Cookie", alice.cookie)
      .send({ name: "Hijacked" });
    expect(update.status).toBe(403);

    const settings = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgB.body.id}/settings`)
      .set("Cookie", alice.cookie)
      .send({ ...SETTINGS, timezone: "Europe/Paris" });
    expect(settings.status).toBe(403);

    const stillBob = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.body.id}`)
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(stillBob.body.name).toBe("Bob Org");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.body.id}`)
      .set("Cookie", alice.cookie)
      .expect(200);
  });

  it("rejects users without ownership and ignores guessed account IDs", async () => {
    const outsider = await registerVerifyLogin();
    const guessed = "11111111-1111-4111-8111-111111111111";
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${guessed}`)
      .set("Cookie", outsider.cookie);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(DIETITIAN_ACCESS_DENIED);
  });

  it("does not let the client supply an organization role or platform role", async () => {
    const owner = await registerVerifyLogin();
    const forged = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Role Forge", settings: SETTINGS, role: "SUPER_ADMIN", platformRole: "ADMIN" })
      .expect(400);

    expect(forged.body.message).toEqual(expect.arrayContaining([expect.stringMatching(/should not exist/i)]));

    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Role Forge", settings: SETTINGS })
      .expect(201);
    expect(org.body.role).toBeUndefined();
    expect(org.body.membershipStatus).toBeUndefined();
  });

  it("blocks non-owners from reading another dietitian account", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Roles Org", settings: SETTINGS })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.body.id}`)
      .set("Cookie", outsider.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.body.id}/settings`)
      .set("Cookie", outsider.cookie)
      .expect(403);

    const outsiderUpdate = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.body.id}/settings`)
      .set("Cookie", outsider.cookie)
      .send({ ...SETTINGS, locale: "fr-LB" });
    expect(outsiderUpdate.status).toBe(403);

    const outsiderArchive = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.body.id}/archive`)
      .set("Cookie", outsider.cookie);
    expect(outsiderArchive.status).toBe(403);
  });

  it("blocks SUSPENDED and ARCHIVED dietitian accounts from normal access", async () => {
    const suspendedOwner = await registerVerifyLogin();
    const suspended = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", suspendedOwner.cookie)
      .send({ name: "Suspended Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, suspended.body.id);
    await ctx.lifecycle.setStatus(suspended.body.id, "SUSPENDED");
    const suspendedAccess = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${suspended.body.id}/settings`)
      .set("Cookie", suspendedOwner.cookie)
      .send(SETTINGS);
    expect(suspendedAccess.status).toBe(403);
    expect(suspendedAccess.body.message).toBe(DIETITIAN_UNAVAILABLE);

    const suspendedClients = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${suspended.body.id}/clients`)
      .set("Cookie", suspendedOwner.cookie);
    expect(suspendedClients.status).toBe(403);
    expect(suspendedClients.body.message).toBe(DIETITIAN_UNAVAILABLE);

    const archivedOwner = await registerVerifyLogin();
    const archived = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", archivedOwner.cookie)
      .send({ name: "Archived Org", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, archived.body.id);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${archived.body.id}/archive`)
      .set("Cookie", archivedOwner.cookie)
      .expect(201);
    const archivedAccess = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${archived.body.id}`)
      .set("Cookie", archivedOwner.cookie);
    expect(archivedAccess.status).toBe(403);
    expect(archivedAccess.body.message).toBe(DIETITIAN_UNAVAILABLE);
  });

  it("validates organization settings", async () => {
    const owner = await registerVerifyLogin();
    const invalid = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({
        name: "Bad Settings",
        settings: { ...SETTINGS, timezone: "Not/AZone", locale: "nope", currency: "XXX" },
      });
    expect(invalid.status).toBe(400);

    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
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

  it("updates settings and archives the account", async () => {
    const owner = await registerVerifyLogin();
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Settings Clinic", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${created.body.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({ ...SETTINGS, timezone: "Europe/Paris", practiceName: "Paris Clinic" })
      .expect(200);
    expect(updated.body.timezone).toBe("Europe/Paris");
    expect(updated.body.practiceName).toBe("Paris Clinic");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${created.body.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const listed = await request(ctx.app.getHttpServer())
      .get("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(listed.body).toHaveLength(0);
  });
});
