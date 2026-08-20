import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  createAuthTestApp,
  cookieValue,
  extractEmailedToken,
  resetAuthDatabase,
  type AuthTestContext,
} from "./app";

const PASSWORD = "ValidPass12";

describe("platform site settings", () => {
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

  function email(prefix: string): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address: string) {
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

  it("returns public site settings without auth", async () => {
    const res = await request(ctx.app.getHttpServer()).get("/api/v1/public/site-settings").expect(200);
    expect(res.body.brandText).toBeTruthy();
    expect(res.body.dietitianSignInLabel).toBeTruthy();
    expect(res.body.patientSignInLabel).toBeTruthy();
    expect(Array.isArray(res.body.navItems)).toBe(true);
    expect(res.body.navItems.some((item: { href: string }) => item.href.includes("pricing"))).toBe(false);
    expect(res.body.navItems.some((item: { href: string }) => item.href.includes("admin"))).toBe(false);
  });

  it("rejects unauthenticated admin site-settings access", async () => {
    await request(ctx.app.getHttpServer()).get("/api/v1/admin/site-settings").expect(401);
  });

  it("allows platform admin to patch contact fields", async () => {
    const session = await registerVerifyLogin(email("site-admin"));
    await ctx.prisma.user.update({ where: { id: session.id }, data: { platformRole: "ADMIN" } });

    const patched = await request(ctx.app.getHttpServer())
      .patch("/api/v1/admin/site-settings")
      .set("Cookie", session.cookie)
      .send({
        contactEmail: "hello@nutrition.example",
        contactPhone: "+1 555 0100",
        brandText: "Nutrition Pro",
      })
      .expect(200);

    expect(patched.body.contactEmail).toBe("hello@nutrition.example");
    expect(patched.body.contactPhone).toBe("+1 555 0100");
    expect(patched.body.brandText).toBe("Nutrition Pro");

    const publicRes = await request(ctx.app.getHttpServer()).get("/api/v1/public/site-settings").expect(200);
    expect(publicRes.body.contactEmail).toBe("hello@nutrition.example");
    expect(publicRes.body.brandText).toBe("Nutrition Pro");
  });

  it("does not allow non-admin users to patch site settings", async () => {
    const session = await registerVerifyLogin(email("dietitian-site"));
    await request(ctx.app.getHttpServer())
      .patch("/api/v1/admin/site-settings")
      .set("Cookie", session.cookie)
      .send({ brandText: "Hacked" })
      .expect(403);
  });
});
