import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  SUBSCRIPTION_LOCKED,
  SUBSCRIPTION_READ_ONLY,
} from "../src/entitlements/subscription.messages";
import { SubscriptionLifecycleService } from "../src/entitlements/subscription-lifecycle.service";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";
import { CLIENT_ACCESS_DENIED } from "../src/clients/client.messages";
import {
  activateStandardSubscription,
  connectClientPortal,
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

const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8");

describe("phase7 dietitian remount", () => {
  let ctx: AuthTestContext;
  let lifecycle: SubscriptionLifecycleService;
  let seq = 0;
  let clock = new Date("2026-08-20T12:00:00.000Z");

  beforeAll(async () => {
    ctx = await createAuthTestApp();
    lifecycle = ctx.app.get(SubscriptionLifecycleService);
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
    clock = new Date("2026-08-20T12:00:00.000Z");
    lifecycle.setClock(() => new Date(clock.getTime()));
  });

  afterAll(async () => {
    lifecycle?.resetClock();
    await ctx?.app.close();
  });

  function email(prefix = "p7"): string {
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
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  async function createAccount(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string; name: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string, body: Record<string, unknown> = {}) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: email("client"),
        ...body,
      })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  it("allows owner access and denies other users", async () => {
    const owner = await registerVerifyLogin();
    const other = await registerVerifyLogin();
    const account = await createAccount(owner.cookie, "Owner Practice");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200);

    const denied = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}`)
      .set("Cookie", other.cookie);
    expect(denied.status).toBe(403);
    expect(denied.body.message).toBe(DIETITIAN_ACCESS_DENIED);
  });

  it("blocks portal users from practice dietitian endpoints", async () => {
    const owner = await registerVerifyLogin();
    const account = await createAccount(owner.cookie, "Portal Block");
    const client = await createClient(owner.cookie, account.id);
    const portal = await connectClientPortal(ctx, owner.cookie, account.id, client);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}/clients`)
      .set("Cookie", portal)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}/clients/${client.id}`)
      .set("Cookie", portal)
      .expect(403);
  });

  it("allows READ_ONLY GET, blocks mutations, and locks except subscription-access", async () => {
    const owner = await registerVerifyLogin();
    const account = await createAccount(owner.cookie, "Lifecycle Practice");
    const client = await createClient(owner.cookie, account.id);

    const readOnlyEnd = new Date(clock.getTime() - 4 * 24 * 60 * 60 * 1000);
    await ctx.prisma.subscription.update({
      where: { dietitianAccountId: account.id },
      data: { status: "ACTIVE", currentPeriodEnd: readOnlyEnd },
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200);

    const mutation = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${account.id}/clients/${client.id}`)
      .set("Cookie", owner.cookie)
      .send({ phone: "999" });
    expect(mutation.status).toBe(403);
    expect(mutation.body.message).toBe(SUBSCRIPTION_READ_ONLY);

    const lockedEnd = new Date(clock.getTime() - 15 * 24 * 60 * 60 * 1000);
    await ctx.prisma.subscription.update({
      where: { dietitianAccountId: account.id },
      data: { currentPeriodEnd: lockedEnd },
    });

    const lockedClients = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}/clients`)
      .set("Cookie", owner.cookie);
    expect(lockedClients.status).toBe(403);
    expect(lockedClients.body.message).toBe(SUBSCRIPTION_LOCKED);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${account.id}/subscription-access`)
      .set("Cookie", owner.cookie)
      .expect(200)
      .expect((res) => expect(res.body.accessState).toBe("LOCKED"));
  });

  it("isolates clients across dietitian accounts", async () => {
    const a = await registerVerifyLogin();
    const b = await registerVerifyLogin();
    const accountA = await createAccount(a.cookie, "Clinic A");
    const accountB = await createAccount(b.cookie, "Clinic B");
    const clientA = await createClient(a.cookie, accountA.id, { firstName: "Ann" });
    const clientB = await createClient(b.cookie, accountB.id, { firstName: "Ben" });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${accountA.id}/clients/${clientB.id}`)
      .set("Cookie", a.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${accountB.id}/clients/${clientB.id}`)
      .set("Cookie", a.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    const listed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${accountA.id}/clients`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].id).toBe(clientA.id);
  });

  it("operates practice APIs without Organization rows", async () => {
    const owner = await registerVerifyLogin();
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Solo Practice", settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);

    expect(created.body.role).toBeUndefined();
    expect(created.body.membershipStatus).toBeUndefined();
    expect((ctx.prisma as { organization?: unknown }).organization).toBeUndefined();

    const accounts = await ctx.prisma.dietitianAccount.count({ where: { id: created.body.id } });
    expect(accounts).toBe(1);

    const client = await createClient(owner.cookie, created.body.id, { firstName: "Solo" });
    const portfolio = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${created.body.id}/clients/${client.id}/portfolio`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(portfolio.body.client.id).toBe(client.id);
  });

  it("isolates document upload and list by dietitian account", async () => {
    const a = await registerVerifyLogin();
    const b = await registerVerifyLogin();
    const accountA = await createAccount(a.cookie, "Docs A");
    const accountB = await createAccount(b.cookie, "Docs B");
    const clientA = await createClient(a.cookie, accountA.id);
    const clientB = await createClient(b.cookie, accountB.id);

    const uploaded = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${accountA.id}/clients/${clientA.id}/documents`)
      .set("Cookie", a.cookie)
      .attach("file", PDF_BUFFER, { filename: "lab.pdf", contentType: "application/pdf" })
      .field("visibility", "INTERNAL")
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${accountA.id}/clients/${clientA.id}/documents`)
      .set("Cookie", a.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.some((row: { id: string }) => row.id === uploaded.body.id)).toBe(true);
      });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${accountB.id}/clients/${clientB.id}/documents`)
      .set("Cookie", b.cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.some((row: { id: string }) => row.id === uploaded.body.id)).toBe(false);
      });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${accountB.id}/clients/${clientB.id}/documents/${uploaded.body.id}/download`)
      .set("Cookie", b.cookie)
      .expect(404);
  });
});
