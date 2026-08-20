import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { SUBSCRIPTION_LOCKED } from "../src/entitlements/subscription.messages";
import { SubscriptionLifecycleService } from "../src/entitlements/subscription-lifecycle.service";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "../src/platform-settings/platform-settings.defaults";
import {
  activateStandardSubscription,
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  extractEmailedToken,
  generateJoinCode,
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

describe("phase5 dashboard + notifications", () => {
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

  function email(prefix = "p5"): string {
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

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, organizationId: string, clientEmail?: string) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: clientEmail ?? email("client"),
      })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  it("isolates practice dashboard by tenant", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const orgA = await createOrg(a.cookie, "Practice A");
    const orgB = await createOrg(b.cookie, "Practice B");
    await createClient(a.cookie, orgA.id);

    const dashA = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgA.id}/practice/dashboard`)
      .set("Cookie", a.cookie)
      .expect(200);
    expect(dashA.body.clientCount).toBe(1);
    expect(dashA.body).toHaveProperty("todayAppointments");
    expect(dashA.body).toHaveProperty("recentConversations");
    expect(dashA.body).toHaveProperty("recentNotifications");
    expect(dashA.body).toHaveProperty("unreadNotificationCount");

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}/practice/dashboard`)
      .set("Cookie", a.cookie)
      .expect(403);

    const dashB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}/practice/dashboard`)
      .set("Cookie", b.cookie)
      .expect(200);
    expect(dashB.body.clientCount).toBe(0);
  });

  it("scopes portal dashboard to active client and changes on switch", async () => {
    const ownerA = await registerVerifyLogin(email("oa"));
    const ownerB = await registerVerifyLogin(email("ob"));
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id);
    const clientB = await createClient(ownerB.cookie, orgB.id);

    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA);
    const { code } = await generateJoinCode(ctx, ownerB.cookie, orgB.id, clientB.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    const first = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/dashboard")
      .set("Cookie", portalCookie)
      .expect(200);
    const firstClientId = first.body.me.client.id as string;
    expect(first.body).toHaveProperty("upcomingAppointment");
    expect(first.body).toHaveProperty("messages");
    expect(first.body).toHaveProperty("notifications");
    expect(first.body).toHaveProperty("tracking");
    expect(first.body).toHaveProperty("quickLinks");

    const connections = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/connections")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(connections.body).toHaveLength(2);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect(200);

    const second = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/dashboard")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(second.body.me.client.id).toBe(clientB.id);
    expect(second.body.me.client.id).not.toBe(firstClientId);
  });

  it("allows READ_ONLY dashboard GET and blocks LOCKED", async () => {
    const owner = await registerVerifyLogin(email("ro"));
    const org = await createOrg(owner.cookie, "RO Practice");
    const periodEnd = new Date(clock.getTime() - 4 * 24 * 60 * 60 * 1000);
    await ctx.prisma.subscription.update({
      where: { dietitianAccountId: org.id },
      data: { status: "ACTIVE", currentPeriodEnd: periodEnd },
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/practice/dashboard`)
      .set("Cookie", owner.cookie)
      .expect(200);

    const lockedEnd = new Date(clock.getTime() - 15 * 24 * 60 * 60 * 1000);
    await ctx.prisma.subscription.update({
      where: { dietitianAccountId: org.id },
      data: { currentPeriodEnd: lockedEnd },
    });

    const locked = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/practice/dashboard`)
      .set("Cookie", owner.cookie)
      .expect(403);
    expect(String(locked.body.message)).toContain("locked");
    void SUBSCRIPTION_LOCKED;
  });

  it("creates appointment and join notifications; supports mark read / read-all / isolation", async () => {
    const owner = await registerVerifyLogin(email("own"));
    const org = await createOrg(owner.cookie, "Notify Practice");
    const client = await createClient(owner.cookie, org.id);
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client);

    const joined = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/notifications`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(joined.body.some((row: { type: string }) => row.type === "CLIENT_JOINED")).toBe(true);

    const start = new Date(clock.getTime() + 60 * 60 * 1000).toISOString();
    const end = new Date(clock.getTime() + 2 * 60 * 60 * 1000).toISOString();
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.id}/appointments`)
      .set("Cookie", owner.cookie)
      .send({ title: "Check-in", startAt: start, endAt: end })
      .expect(201);

    const portalNotifs = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalCookie)
      .expect(200);
    const appointment = portalNotifs.body.find(
      (row: { type: string; id: string }) => row.type === "APPOINTMENT_CREATED",
    );
    expect(appointment).toBeTruthy();

    const unread = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications/unread-count")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(unread.body.count).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/portal/notifications/${appointment.id}/read`)
      .set("Cookie", portalCookie)
      .expect(200);

    const markAll = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/notifications/read-all")
      .set("Cookie", portalCookie);
    expect([200, 201]).toContain(markAll.status);

    const orgMarkAll = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/notifications/read-all`)
      .set("Cookie", owner.cookie);
    expect([200, 201]).toContain(orgMarkAll.status);

    const other = await registerVerifyLogin(email("other"));
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/notifications`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  it("gates product invoice email behind emailNotificationsEnabled while keeping in-app", async () => {
    const owner = await registerVerifyLogin(email("inv"));
    const org = await createOrg(owner.cookie, "Invoice Practice");
    const client = await createClient(owner.cookie, org.id);
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client);

    const settings = await ctx.prisma.platformSettings.findUniqueOrThrow({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    });
    expect(settings.emailNotificationsEnabled).toBe(false);

    const publicSettings = await request(ctx.app.getHttpServer())
      .get("/api/v1/public/site-settings")
      .expect(200);
    expect(publicSettings.body.emailNotificationsEnabled).toBeUndefined();

    await request(ctx.app.getHttpServer())
      .patch("/api/v1/admin/site-settings")
      .set("Cookie", owner.cookie)
      .send({ emailNotificationsEnabled: true })
      .expect(403);

    const draft = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.id}/invoices`)
      .set("Cookie", owner.cookie)
      .send({
        items: [{ description: "Consult", quantity: 1, unitPrice: 50 }],
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/invoices/${draft.body.id}/issue`)
      .set("Cookie", owner.cookie)
      .expect(201);

    ctx.emails.messages.length = 0;
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/invoices/${draft.body.id}/send`)
      .set("Cookie", owner.cookie)
      .expect(201);

    expect(ctx.emails.messages.some((m) => m.subject.startsWith("Invoice"))).toBe(false);

    const portalNotifs = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(portalNotifs.body.some((row: { type: string }) => row.type === "INVOICE_SENT")).toBe(true);

    const admin = await makeAdmin();
    await request(ctx.app.getHttpServer())
      .patch("/api/v1/admin/site-settings")
      .set("Cookie", admin.cookie)
      .send({ emailNotificationsEnabled: true })
      .expect(200);

    const draft2 = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.id}/invoices`)
      .set("Cookie", owner.cookie)
      .send({
        items: [{ description: "Follow-up", quantity: 1, unitPrice: 25 }],
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/invoices/${draft2.body.id}/issue`)
      .set("Cookie", owner.cookie)
      .expect(201);

    ctx.emails.messages.length = 0;
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/invoices/${draft2.body.id}/send`)
      .set("Cookie", owner.cookie)
      .expect(201);
    expect(ctx.emails.messages.some((m) => m.subject.startsWith("Invoice"))).toBe(true);
  });
});
