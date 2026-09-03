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

describe("public contact submissions", () => {
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
    if (ctx.emails.messages.length > 0) {
      const token = extractEmailedToken(ctx.emails.last().text);
      await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    }
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: PASSWORD })
      .expect(200);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: address.toLowerCase() },
    });
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`, id: user.id };
  }

  it("accepts a public contact message without auth", async () => {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/public/contact")
      .send({
        name: "Sam Clinic",
        email: "sam@clinic.example",
        subject: "Trial question",
        message: "How do I add a client?",
      })
      .expect(201);

    expect(created.body.id).toBeTruthy();

    const stored = await ctx.prisma.contactSubmission.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.name).toBe("Sam Clinic");
    expect(stored.email).toBe("sam@clinic.example");
    expect(stored.status).toBe("NEW");
  });

  it("rejects an empty contact message", async () => {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/public/contact")
      .send({ name: "Sam", email: "not-an-email", subject: "Hi", message: "" })
      .expect(400);
  });

  it("stores an optional plan slug from the contact form", async () => {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/public/contact")
      .send({
        name: "Sam Clinic",
        email: "sam@clinic.example",
        subject: "Pro plan",
        message: "I would like to continue on Pro.",
        planSlug: "pro",
      })
      .expect(201);

    const stored = await ctx.prisma.contactSubmission.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.planSlug).toBe("pro");
    expect(stored.planName).toBeTruthy();
  });

  it("rejects unauthenticated admin inbox access", async () => {
    await request(ctx.app.getHttpServer()).get("/api/v1/admin/contact-messages").expect(401);
  });

  it("denies the inbox to a dietitian and lists messages for an admin", async () => {
    const dietitian = await registerVerifyLogin(email("contact-dietitian"));
    await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/contact-messages")
      .set("Cookie", dietitian.cookie)
      .expect(403);

    const admin = await registerVerifyLogin(email("contact-admin"));
    await ctx.prisma.user.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });

    await request(ctx.app.getHttpServer())
      .post("/api/v1/public/contact")
      .send({
        name: "Sam Clinic",
        email: "sam@clinic.example",
        subject: "Need help",
        message: "A short question.",
      })
      .expect(201);

    const list = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/contact-messages?status=inbox")
      .set("Cookie", admin.cookie)
      .expect(200);

    expect(list.body.total).toBe(1);
    expect(list.body.newCount).toBe(1);
    expect(list.body.items[0].subject).toBe("Need help");
    expect(list.body.items[0].preview).toBe("A short question.");

    const id = list.body.items[0].id as string;
    const detail = await request(ctx.app.getHttpServer())
      .get(`/api/v1/admin/contact-messages/${id}`)
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(detail.body.message).toBe("A short question.");
    expect(detail.body.status).toBe("NEW");

    const archived = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/admin/contact-messages/${id}`)
      .set("Cookie", admin.cookie)
      .send({ status: "ARCHIVED" })
      .expect(200);
    expect(archived.body.status).toBe("ARCHIVED");

    const inbox = await request(ctx.app.getHttpServer())
      .get("/api/v1/admin/contact-messages?status=inbox")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(inbox.body.total).toBe(0);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/admin/contact-messages/${id}`)
      .set("Cookie", admin.cookie)
      .expect(200);

    const remaining = await ctx.prisma.contactSubmission.count();
    expect(remaining).toBe(0);
  });
});
