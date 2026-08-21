import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  DISCONNECT_REQUEST_NONE,
  DISCONNECT_REQUEST_PENDING,
} from "../src/clients/client.messages";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
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

describe("patient disconnect request", () => {
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

  function email(prefix = "dc"): string {
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
    return created.body as { id: string };
  }

  it("lets patient request leave, notifies dietitian, and keeps access until deactivate", async () => {
    const owner = await registerVerifyLogin(email("own"));
    const practice = await createPractice(owner.cookie, "Leave Clinic");
    const clientRes = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "Emma", lastName: "Leave", email: email("pat") })
      .expect(201);
    const client = clientRes.body as { id: string; email: string };
    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    const requested = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/disconnect-request")
      .set("Cookie", portalCookie)
      .send({ note: "Moving cities" })
      .expect(201);
    expect(requested.body.status).toBe("requested");
    expect(requested.body.clientId).toBe(client.id);

    const account = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(account.status).toBe("ACTIVE");
    expect(account.disconnectRequestedAt).toBeTruthy();
    expect(account.disconnectRequestNote).toBe("Moving cities");

    await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200).expect((res) => {
      expect(res.body.disconnectRequestedAt).toBeTruthy();
      expect(res.body.disconnectRequestNote).toBe("Moving cities");
    });

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/disconnect-request")
      .set("Cookie", portalCookie)
      .send({})
      .expect(409)
      .expect((res) => expect(res.body.message).toBe(DISCONNECT_REQUEST_PENDING));

    const notifs = await ctx.prisma.notification.findMany({
      where: { dietitianAccountId: practice.id, type: "DISCONNECT_REQUESTED", clientId: client.id },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0]?.body).toContain("Moving cities");

    const accountView = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(accountView.body.disconnectRequestedAt).toBeTruthy();
    expect(accountView.body.disconnectRequestNote).toBe("Moving cities");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const after = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(after.status).toBe("DEACTIVATED");
    expect(after.disconnectRequestedAt).toBeNull();
    expect(after.disconnectRequestNote).toBeNull();

    await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(403);
  });

  it("allows patient cancel and dietitian dismiss without deactivating", async () => {
    const owner = await registerVerifyLogin(email("own2"));
    const practice = await createPractice(owner.cookie, "Dismiss Clinic");
    const clientRes = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "Sam", lastName: "Stay", email: email("stay") })
      .expect(201);
    const client = clientRes.body as { id: string; email: string };
    const portalCookie = await connectClientPortal(ctx, owner.cookie, practice.id, client);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/disconnect-request")
      .set("Cookie", portalCookie)
      .send({})
      .expect(201);

    await request(ctx.app.getHttpServer())
      .delete("/api/v1/portal/connections/disconnect-request")
      .set("Cookie", portalCookie)
      .send({})
      .expect(200)
      .expect((res) => expect(res.body.status).toBe("cancelled"));

    const cancelled = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(cancelled.disconnectRequestedAt).toBeNull();
    expect(cancelled.status).toBe("ACTIVE");

    await request(ctx.app.getHttpServer())
      .delete("/api/v1/portal/connections/disconnect-request")
      .set("Cookie", portalCookie)
      .send({})
      .expect(404)
      .expect((res) => expect(res.body.message).toBe(DISCONNECT_REQUEST_NONE));

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/disconnect-request")
      .set("Cookie", portalCookie)
      .send({ note: "Please disconnect" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${practice.id}/clients/${client.id}/account/disconnect-request/dismiss`)
      .set("Cookie", owner.cookie)
      .expect(200);

    const dismissed = await ctx.prisma.clientAccount.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(dismissed.status).toBe("ACTIVE");
    expect(dismissed.disconnectRequestedAt).toBeNull();
    expect(dismissed.disconnectRequestNote).toBeNull();

    await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200);
  });
});
