import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "../src/platform-settings/platform-settings.defaults";
import {
  activateStandardSubscription,
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

describe("phase2.5 organization cleanup", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
    await ctx.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
      data: { registrationEnabled: true },
    });
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  function email(prefix = "p25"): string {
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

  async function makeAdmin() {
    const session = await registerVerifyLogin(email("admin"));
    await ctx.prisma.user.update({
      where: { id: session.id },
      data: { platformRole: "SUPER_ADMIN" },
    });
    return session;
  }

  async function createPractice(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string; name: string };
  }

  it("has no active /api/v1/organizations practice routes", async () => {
    const owner = await registerVerifyLogin();
    await request(ctx.app.getHttpServer()).get("/api/v1/organizations").set("Cookie", owner.cookie).expect(404);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", owner.cookie)
      .send({ name: "Nope", settings: SETTINGS })
      .expect(404);
  });

  it("uses dietitianAccountId practice routes and denies cross-account access", async () => {
    const ownerA = await registerVerifyLogin(email("a"));
    const ownerB = await registerVerifyLogin(email("b"));
    const practiceA = await createPractice(ownerA.cookie, "Practice A");
    const practiceB = await createPractice(ownerB.cookie, "Practice B");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}`)
      .set("Cookie", ownerA.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe(practiceA.id);
        expect(res.body.context.dietitianAccountId).toBe(practiceA.id);
        expect(res.body.context.membershipId).toBeUndefined();
        expect(res.body.context).not.toHaveProperty("organizationId");
      });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients`)
      .set("Cookie", ownerA.cookie)
      .expect(403);
  });

  it("admin manages dietitians and has no organizations admin path", async () => {
    const admin = await makeAdmin();
    const owner = await registerVerifyLogin(email("own"));
    const practice = await createPractice(owner.cookie, "Admin Target");

    await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/dietitians")
      .set("Cookie", admin.cookie)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some((row: { id: string }) => row.id === practice.id)).toBe(true);
      });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/admin/dietitians/${practice.id}`)
      .set("Cookie", admin.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.members).toBeUndefined();
      });

    await request(ctx.app.getHttpServer()).get("/api/v1/admin/organizations").set("Cookie", admin.cookie).expect(404);
  });

  it("does not grant access via planted ClientAssignment rows", async () => {
    const ownerA = await registerVerifyLogin(email("ownA"));
    const ownerB = await registerVerifyLogin(email("ownB"));
    const practiceA = await createPractice(ownerA.cookie, "Practice A");
    const practiceB = await createPractice(ownerB.cookie, "Practice B");
    const client = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practiceA.id}/clients`)
      .set("Cookie", ownerA.cookie)
      .send({ firstName: "Pat", lastName: "Client" })
      .expect(201);

    await ctx.prisma.clientAssignment.create({
      data: {
        dietitianAccountId: practiceA.id,
        clientId: client.body.id,
        userId: ownerB.id,
      },
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/clients/${client.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${client.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(403);
  });
});
