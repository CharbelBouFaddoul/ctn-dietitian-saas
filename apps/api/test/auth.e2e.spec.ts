import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { UserStatus } from "@prisma/client";
import { AUTH_MESSAGES } from "../src/auth/auth.messages";
import {
  createAuthTestApp,
  cookieHeader,
  cookieValue,
  extractEmailedToken,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";

const PASSWORD = "ValidPass12";
const OTHER_PASSWORD = "OtherPass34";

describe("authentication", () => {
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
    return `user${seq}@example.com`;
  }

  async function register(address = email(), password = PASSWORD) {
    const response = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: address,
        password,
        consents: [{ type: "TERMS_OF_SERVICE", policyVersion: "1.0" }],
      });
    return { address, response };
  }

  async function registerAndVerify(address = email(), password = PASSWORD) {
    await register(address, password);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    return { address, password, token };
  }

  function login(address: string, password = PASSWORD) {
    return request(ctx.app.getHttpServer()).post("/api/v1/auth/login").send({ email: address, password });
  }

  async function setStatus(address: string, status: UserStatus) {
    await ctx.prisma.user.update({
      where: { emailNormalized: address.toLowerCase() },
      data: {
        status,
        suspendedAt: status === "SUSPENDED" ? new Date() : null,
        archivedAt: status === "ARCHIVED" ? new Date() : null,
      },
    });
  }

  it("does not allow unverified users to login", async () => {
    const { address } = await register();
    const response = await login(address);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe(AUTH_MESSAGES.invalidCredentials);
  });

  it("registers without revealing whether an email is taken and stores consents", async () => {
    const address = email();
    const first = await register(address);
    expect(first.response.status).toBe(200);
    expect(first.response.body.message).toBe(AUTH_MESSAGES.register);

    const second = await register(address);
    expect(second.response.status).toBe(200);
    expect(second.response.body.message).toBe(first.response.body.message);

    const user = await ctx.prisma.user.findUnique({ where: { emailNormalized: address } });
    expect(user?.passwordHash).not.toBe(PASSWORD);
    expect(ctx.passwords.isArgon2idHash(user?.passwordHash ?? "")).toBe(true);
    expect(user?.passwordHash.includes(PASSWORD)).toBe(false);

    const consents = await ctx.prisma.consent.findMany({ where: { userId: user?.id } });
    expect(consents).toHaveLength(1);
    expect(consents[0]?.policyVersion).toBe("1.0");
  });

  it("verifies email, then allows login and /me", async () => {
    const { address } = await registerAndVerify();
    const loginResponse = await login(address);
    expect(loginResponse.status).toBe(200);
    const raw = cookieValue(loginResponse.headers["set-cookie"]);
    const header = cookieHeader(loginResponse.headers["set-cookie"]) ?? "";
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).not.toMatch(/Secure/i);
    expect(header).toMatch(/Max-Age=604800/i);

    const session = await ctx.prisma.session.findFirst({ where: { user: { emailNormalized: address } } });
    expect(session).toBeTruthy();
    expect(session?.tokenHash).not.toBe(raw);
    expect(session?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session?.revokedAt).toBeNull();

    const me = await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `ns_session=${raw}`)
      .expect(200);

    expect(me.body.user.email.toLowerCase()).toBe(address);
    expect(me.body.user.status).toBe("ACTIVE");
    expect(me.body.session.id).toBe(session?.id);
  });

  it("rejects invalid password with the same message as a nonexistent account", async () => {
    const { address } = await registerAndVerify();
    const invalid = await login(address, "WrongPass99");
    const missing = await login("missing@example.com", PASSWORD);

    expect(invalid.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(invalid.body.message).toBe(AUTH_MESSAGES.invalidCredentials);
    expect(missing.body.message).toBe(invalid.body.message);
  });

  it("does not allow suspended or archived users to login", async () => {
    const suspended = await registerAndVerify();
    await setStatus(suspended.address, "SUSPENDED");
    const suspendedLogin = await login(suspended.address);
    expect(suspendedLogin.status).toBe(401);
    expect(suspendedLogin.body.message).toBe(AUTH_MESSAGES.invalidCredentials);

    const archived = await registerAndVerify();
    await setStatus(archived.address, "ARCHIVED");
    const archivedLogin = await login(archived.address);
    expect(archivedLogin.status).toBe(401);
    expect(archivedLogin.body.message).toBe(AUTH_MESSAGES.invalidCredentials);
  });

  it("logout revokes the session so it cannot authenticate again", async () => {
    const { address } = await registerAndVerify();
    const loginResponse = await login(address).expect(200);
    const raw = cookieValue(loginResponse.headers["set-cookie"]);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", `ns_session=${raw}`)
      .expect(200);

    const session = await ctx.prisma.session.findFirst({ where: { user: { emailNormalized: address } } });
    expect(session?.revokedAt).not.toBeNull();

    await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `ns_session=${raw}`)
      .expect(401);
  });

  it("rejects an expired session", async () => {
    const { address } = await registerAndVerify();
    const loginResponse = await login(address).expect(200);
    const raw = cookieValue(loginResponse.headers["set-cookie"]);
    await ctx.prisma.session.updateMany({
      where: { user: { emailNormalized: address } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `ns_session=${raw}`)
      .expect(401);
  });

  it("uses a verification token once and rejects reuse and expiry", async () => {
    const address = email();
    await register(address);
    const token = extractEmailedToken(ctx.emails.last().text);
    const hash = ctx.tokens.hashToken(token);
    const stored = await ctx.prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    expect(stored?.tokenHash).not.toBe(token);

    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(400);

    const expiredAddress = email();
    await register(expiredAddress);
    const expiredToken = extractEmailedToken(ctx.emails.last().text);
    await ctx.prisma.emailVerificationToken.update({
      where: { tokenHash: ctx.tokens.hashToken(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: expiredToken })
      .expect(400);
  });

  it("resets password, rejects token reuse/expiry, and revokes existing sessions", async () => {
    const { address } = await registerAndVerify();
    const firstLogin = await login(address).expect(200);
    const oldSession = cookieValue(firstLogin.headers["set-cookie"]);

    const unknown = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" })
      .expect(200);
    const known = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: address })
      .expect(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(known.body.message).toBe(AUTH_MESSAGES.forgotPassword);

    const resetToken = extractEmailedToken(ctx.emails.last().text);
    const hash = ctx.tokens.hashToken(resetToken);
    const stored = await ctx.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    expect(stored?.tokenHash).not.toBe(resetToken);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, password: OTHER_PASSWORD })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `ns_session=${oldSession}`)
      .expect(401);

    await login(address, PASSWORD).expect(401);
    await login(address, OTHER_PASSWORD).expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, password: PASSWORD })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: address })
      .expect(200);
    const expiredToken = extractEmailedToken(ctx.emails.last().text);
    await ctx.prisma.passwordResetToken.update({
      where: { tokenHash: ctx.tokens.hashToken(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: expiredToken, password: PASSWORD })
      .expect(400);
  });
});
