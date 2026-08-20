import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { JOIN_CODE_INVALID } from "../src/clients/client.messages";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "../src/platform-settings/platform-settings.defaults";
import {
  activateStandardSubscription,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  generatePracticeJoinCode,
  resetAuthDatabase,
  TEST_PASSWORD,
  type AuthTestContext,
} from "./app";

const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("phase3 patient connections", () => {
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

  function email(prefix = "p3c"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email()) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: TEST_PASSWORD, firstName: "Pat", lastName: "Patient" })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { emailNormalized: address.toLowerCase() },
    });
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}`, id: user.id };
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

  it("resolves practice join codes and supports multi-dietitian connections with isolation", async () => {
    const ownerA = await registerVerifyLogin(email("ownA"));
    const ownerB = await registerVerifyLogin(email("ownB"));
    const practiceA = await createPractice(ownerA.cookie, "Clinic Alpha");
    const practiceB = await createPractice(ownerB.cookie, "Clinic Beta");
    const codeA = await generatePracticeJoinCode(ctx, ownerA.cookie, practiceA.id);
    const codeB = await generatePracticeJoinCode(ctx, ownerB.cookie, practiceB.id);

    const patient = await registerVerifyLogin(email("pat"));

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join-code/resolve")
      .set("Cookie", patient.cookie)
      .send({ code: "NOPECODE" })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(JOIN_CODE_INVALID));

    const resolvedA = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join-code/resolve")
      .set("Cookie", patient.cookie)
      .send({ code: codeA.code })
      .expect(200);
    expect(resolvedA.body.status).toBe("ok");
    expect(resolvedA.body.practiceName).toBeTruthy();
    expect(resolvedA.body.dietitianDisplayName).toBeTruthy();
    expect(resolvedA.body).not.toHaveProperty("subscription");

    const joinedA = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: codeA.code })
      .expect(201);
    expect(joinedA.body.status).toBe("joined");
    const clientAId = joinedA.body.clientId as string;

    const accountsAfterA = await ctx.prisma.clientAccount.count({ where: { userId: patient.id } });
    expect(accountsAfterA).toBe(1);

    const again = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: codeA.code })
      .expect(201);
    expect(again.body.status).toBe("already_connected");
    expect(again.body.clientId).toBe(clientAId);
    expect(await ctx.prisma.clientAccount.count({ where: { userId: patient.id } })).toBe(1);

    const resolveAgain = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join-code/resolve")
      .set("Cookie", patient.cookie)
      .send({ code: codeA.code })
      .expect(200);
    expect(resolveAgain.body.status).toBe("already_connected");
    expect(resolveAgain.body.clientId).toBe(clientAId);

    const joinedB = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", patient.cookie)
      .send({ code: codeB.code })
      .expect(201);
    expect(joinedB.body.status).toBe("joined");
    const clientBId = joinedB.body.clientId as string;
    expect(clientBId).not.toBe(clientAId);
    expect(await ctx.prisma.clientAccount.count({ where: { userId: patient.id } })).toBe(2);

    const connections = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/connections")
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(connections.body).toHaveLength(2);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientAId })
      .expect(200);

    const meA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(meA.body.client.id).toBe(clientAId);

    const loggedAt = new Date().toISOString();
    const date = loggedAt.slice(0, 10);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", patient.cookie)
      .send({ amount: 250, unit: "ml", loggedAt })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientBId })
      .expect(200);

    const meB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(meB.body.client.id).toBe(clientBId);

    const summaryB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${date}`)
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(summaryB.body.water.totalMl).toBe(0);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientAId })
      .expect(200);

    const summaryA = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${date}`)
      .set("Cookie", patient.cookie)
      .expect(200);
    expect(summaryA.body.water.totalMl).toBe(250);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", patient.cookie)
      .send({ clientId: clientBId })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/clients/${clientAId}`)
      .set("Cookie", ownerB.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${clientBId}`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/clients/${clientAId}`)
      .set("Cookie", ownerA.cookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceA.id}/join-code`)
      .set("Cookie", ownerB.cookie)
      .expect(403);
  });
});
