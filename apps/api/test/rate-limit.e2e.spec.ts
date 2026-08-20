import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  activateSubscription,
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

describe("auth rate limiting", () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = "3";
    process.env.AUTH_THROTTLE_TTL_MS = "60000";
    ctx = await createAuthTestApp();
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = "10000";
    process.env.AUTH_THROTTLE_TTL_MS = "60000";
    await ctx?.app.close();
  });

  it("rate limits login attempts", async () => {
    const login = () =>
      request(ctx.app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "missing@example.com", password: PASSWORD });

    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(429);
  });
});

describe("ai and messaging rate limiting", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    process.env.AI_THROTTLE_LIMIT = "2";
    process.env.MESSAGING_THROTTLE_LIMIT = "2";
    process.env.AUTH_THROTTLE_LIMIT = "10000";
    process.env.AI_ENABLED = "true";
    process.env.AI_PROVIDER = "mock";
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    process.env.AI_THROTTLE_LIMIT = "10000";
    process.env.MESSAGING_THROTTLE_LIMIT = "10000";
    process.env.AUTH_THROTTLE_LIMIT = "10000";
    await ctx?.app.close();
  });

  function email(prefix = "rl"): string {
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
    return { cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  async function createProAccount(cookie: string) {
    const org = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name: "Rate Limit Clinic", settings: SETTINGS })
      .expect(201);
    await activateSubscription(ctx.prisma, org.body.id, "pro");
    const client = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.body.id}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client") })
      .expect(201);
    return { dietitianAccountId: org.body.id as string, clientId: client.body.id as string, cookie };
  }

  it("rate limits AI generation endpoints", async () => {
    const owner = await registerVerifyLogin();
    const { dietitianAccountId, clientId, cookie } = await createProAccount(owner.cookie);
    const path = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/ai/client-summary`;

    expect((await request(ctx.app.getHttpServer()).post(path).set("Cookie", cookie).send({})).status).toBe(201);
    expect((await request(ctx.app.getHttpServer()).post(path).set("Cookie", cookie).send({})).status).toBe(201);
    expect((await request(ctx.app.getHttpServer()).post(path).set("Cookie", cookie).send({})).status).toBe(429);
  });

  it("rate limits org messaging sends", async () => {
    const owner = await registerVerifyLogin();
    const { dietitianAccountId, clientId, cookie } = await createProAccount(owner.cookie);
    const path = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/conversation/messages`;
    const body = { body: "Hello" };

    expect((await request(ctx.app.getHttpServer()).post(path).set("Cookie", cookie).send(body)).status).toBe(201);
    expect((await request(ctx.app.getHttpServer()).post(path).set("Cookie", cookie).send(body)).status).toBe(201);
    expect((await request(ctx.app.getHttpServer()).post(path).set("Cookie", cookie).send(body)).status).toBe(429);
  });
});

describe("cookie secure flag", () => {
  it("can be forced on via COOKIE_SECURE", async () => {
    process.env.COOKIE_SECURE = "true";
    process.env.AUTH_THROTTLE_LIMIT = "10000";
    const ctx = await createAuthTestApp();
    await resetAuthDatabase(ctx.prisma);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "secure@example.com", password: PASSWORD });
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token });
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "secure@example.com", password: PASSWORD });

    const header = login.headers["set-cookie"]?.[0] ?? "";
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/HttpOnly/i);

    process.env.COOKIE_SECURE = "false";
    await ctx.app.close();
  });
});
