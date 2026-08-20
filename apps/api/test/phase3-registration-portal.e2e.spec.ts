import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { AUTH_MESSAGES } from "../src/auth/auth.messages";
import { PORTAL_CONNECTION_REQUIRED } from "../src/clients/client.messages";
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

describe("phase3 registration + portal connections", () => {
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

  function email(prefix = "p3"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function setRegistrationEnabled(enabled: boolean) {
    await ctx.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
      data: { registrationEnabled: enabled },
    });
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
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string; name: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body });
  }

  it("rejects register and org create when registrationEnabled is false", async () => {
    await setRegistrationEnabled(false);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: email(), password: PASSWORD })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(AUTH_MESSAGES.registrationDisabled));

    await setRegistrationEnabled(true);
    const owner = await registerVerifyLogin();
    await setRegistrationEnabled(false);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", owner.cookie)
      .send({ name: "Blocked Practice", settings: SETTINGS })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(AUTH_MESSAGES.registrationDisabled));
  });

  it("allows register and org create when registrationEnabled is true", async () => {
    await setRegistrationEnabled(true);
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Open Practice");
    expect(org.id).toBeTruthy();
  });

  it("provisions a dietitian via admin and activates via invitation", async () => {
    await setRegistrationEnabled(true);
    const admin = await makeAdmin();
    const plan = await ctx.prisma.plan.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const address = email("diet");

    const provisioned = await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/dietitians")
      .set("Cookie", admin.cookie)
      .send({
        email: address,
        displayName: "Provisioned Practice",
        firstName: "Dana",
        lastName: "Dietitian",
        planId: plan.id,
      })
      .expect(201);

    expect(provisioned.body.dietitianAccount.id).toBeTruthy();
    expect(provisioned.body.invitationSent).toBe(true);

    const activationMail =
      ctx.emails.messages.find((msg) => msg.subject?.includes("Activate your practice")) ??
      ctx.emails.messages.find((msg) => msg.text.includes("Activate your practice")) ??
      ctx.emails.last();
    expect(activationMail?.text).toBeTruthy();
    const inviteToken = extractEmailedToken(activationMail!.text);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/accept-invitation")
      .send({ token: inviteToken, password: PASSWORD })
      .expect(200);

    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: PASSWORD })
      .expect(200);
    const cookie = `ns_session=${cookieValue(login.headers["set-cookie"])}`;

    const orgs = await request(ctx.app.getHttpServer())
      .get("/api/v1/dietitian")
      .set("Cookie", cookie)
      .expect(200);
    expect(orgs.body).toHaveLength(1);
    expect(orgs.body[0].id).toBe(provisioned.body.dietitianAccount.id);

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/onboarding")
      .set("Cookie", cookie)
      .expect(403);
  });

  it("supports multi-dietitian portal connections with active client switching", async () => {
    await setRegistrationEnabled(true);
    const ownerA = await registerVerifyLogin(email("ownA"));
    const ownerB = await registerVerifyLogin(email("ownB"));
    const orgA = await createOrg(ownerA.cookie, "Practice A");
    const orgB = await createOrg(ownerB.cookie, "Practice B");
    const clientA = await createClient(ownerA.cookie, orgA.id, { firstName: "Ann" });
    const clientB = await createClient(ownerB.cookie, orgB.id, { firstName: "Ben" });

    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, orgA.id, {
      id: clientA.body.id,
      email: clientA.body.email,
    });

    const codeB = await generateJoinCode(ctx, ownerB.cookie, orgB.id, clientB.body.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code: codeB.code })
      .expect(201);

    const connections = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/connections")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(connections.body).toHaveLength(2);

    // Clear active client to force selection on clinical endpoints
    const session = await ctx.prisma.session.findFirstOrThrow({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    await ctx.prisma.session.update({
      where: { id: session.id },
      data: { activeClientId: null },
    });

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portalCookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(PORTAL_CONNECTION_REQUIRED));

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.body.id })
      .expect(200);

    const me = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/me")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(me.body.client.id).toBe(clientB.body.id);

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/meal-plan")
      .set("Cookie", portalCookie)
      .expect(200);
  });

  it("blocks patient access to practice tenant routes", async () => {
    await setRegistrationEnabled(true);
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Tenant Guard Org");
    const client = await createClient(owner.cookie, org.id);
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, {
      id: client.body.id,
      email: client.body.email,
    });

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", portalCookie)
      .expect(403);
  });

  it("exposes registrationEnabled on public and admin site settings", async () => {
    await setRegistrationEnabled(false);
    const publicSettings = await request(ctx.app.getHttpServer())
      .get("/api/v1/public/site-settings")
      .expect(200);
    expect(publicSettings.body.registrationEnabled).toBe(false);

    await setRegistrationEnabled(true);
    const admin = await makeAdmin();
    const patched = await request(ctx.app.getHttpServer())
      .patch("/api/v1/admin/site-settings")
      .set("Cookie", admin.cookie)
      .send({ registrationEnabled: false })
      .expect(200);
    expect(patched.body.registrationEnabled).toBe(false);
  });
});
