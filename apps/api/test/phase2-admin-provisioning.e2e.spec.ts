import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { AUTH_MESSAGES } from "../src/auth/auth.messages";
import { ADMIN_MESSAGES } from "../src/admin/admin.messages";
import { DIETITIAN_UNAVAILABLE } from "../src/dietitian/dietitian.types";
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

describe("phase2 admin provisioning", () => {
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

  function email(prefix = "p2"): string {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function setRegistrationEnabled(enabled: boolean) {
    await ctx.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
      data: {
        dietitianRegistrationEnabled: enabled,
        patientRegistrationEnabled: enabled,
      },
    });
  }

  async function registerVerifyLogin(address = email()) {
    await setRegistrationEnabled(true);
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

  it("rejects non-admin dietitian and patient provision", async () => {
    const owner = await registerVerifyLogin();
    await createPractice(owner.cookie, "Owner Practice");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/dietitians")
      .set("Cookie", owner.cookie)
      .send({ email: email("diet"), displayName: "Nope" })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", owner.cookie)
      .send({
        dietitianAccountId: "00000000-0000-4000-8000-000000000099",
        firstName: "Pat",
        lastName: "Client",
      })
      .expect(403);
  });

  it("rejects duplicate dietitian email and registration when disabled", async () => {
    const admin = await makeAdmin();
    const address = email("diet");

    await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/dietitians")
      .set("Cookie", admin.cookie)
      .send({ email: address, displayName: "First Practice" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/dietitians")
      .set("Cookie", admin.cookie)
      .send({ email: address, displayName: "Second Practice" })
      .expect(409)
      .expect((res) => expect(res.body.message).toBe(ADMIN_MESSAGES.userAlreadyExists));

    await setRegistrationEnabled(false);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: email("blocked"), password: PASSWORD })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(AUTH_MESSAGES.registrationDisabled));
  });

  it("provisions dietitian with profile fields, clientLimit override, and activation", async () => {
    const admin = await makeAdmin();
    const plan = await ctx.prisma.plan.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const address = email("diet");

    const provisioned = await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/dietitians")
      .set("Cookie", admin.cookie)
      .send({
        email: address,
        displayName: "Enriched Practice",
        firstName: "Dana",
        lastName: "Dietitian",
        phone: "+15551212",
        professionalTitle: "RD",
        specialization: "Sports",
        planId: plan.id,
        clientLimit: 42,
      })
      .expect(201);

    expect(provisioned.body.dietitianAccount.phone).toBe("+15551212");
    expect(provisioned.body.dietitianAccount.professionalTitle).toBe("RD");
    expect(provisioned.body.dietitianAccount.specialization).toBe("Sports");
    expect(provisioned.body.clientLimitOverride.limitValue).toBe(42);

    const account = await ctx.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: provisioned.body.dietitianAccount.id },
    });
    expect(account.phone).toBe("+15551212");
    expect(account.professionalTitle).toBe("RD");
    expect(account.specialization).toBe("Sports");

    const feature = await ctx.prisma.feature.findUniqueOrThrow({
      where: { key: FEATURE_KEYS.CLIENT_LIMIT },
    });
    const override = await ctx.prisma.featureOverride.findUniqueOrThrow({
      where: {
        dietitianAccountId_featureId: {
          dietitianAccountId: account.id,
          featureId: feature.id,
        },
      },
    });
    expect(override.limitValue).toBe(42);

    const activationMail =
      ctx.emails.messages.find((msg) => msg.subject?.includes("Activate your practice")) ??
      ctx.emails.last();
    const inviteToken = extractEmailedToken(activationMail!.text);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/accept-invitation")
      .send({ token: inviteToken, password: PASSWORD })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: PASSWORD })
      .expect(200);
  });

  it("provisions patient under dietitian with measurements and optional portal invite", async () => {
    const admin = await makeAdmin();
    const owner = await registerVerifyLogin(email("own"));
    const practice = await createPractice(owner.cookie, "Clinic A");
    const patientEmail = email("pat");

    const withInvite = await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", admin.cookie)
      .send({
        dietitianAccountId: practice.id,
        firstName: "Ann",
        lastName: "Patient",
        email: patientEmail,
        activityLevel: "moderately active",
        heightCm: 170,
        weightKg: 65,
      })
      .expect(201);

    expect(withInvite.body.invitationSent).toBe(true);
    expect(withInvite.body.portalUser.status).toBe("PENDING");
    expect(withInvite.body.measurements).toHaveLength(2);

    const profile = await ctx.prisma.clientProfile.findUniqueOrThrow({
      where: { clientId: withInvite.body.client.id },
    });
    expect(profile.lifestyle).toBe("moderately active");

    const measurements = await ctx.prisma.clientMeasurement.findMany({
      where: { clientId: withInvite.body.client.id },
    });
    expect(measurements.map((row) => row.type).sort()).toEqual(["HEIGHT", "WEIGHT"]);

    const inviteMail =
      ctx.emails.messages.find((msg) => msg.subject?.includes("patient portal")) ??
      ctx.emails.last();
    const inviteToken = extractEmailedToken(inviteMail!.text);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/accept-invitation")
      .send({ token: inviteToken, password: PASSWORD })
      .expect(200);

    const portalAccount = await ctx.prisma.clientAccount.findUniqueOrThrow({
      where: { clientId: withInvite.body.client.id },
    });
    expect(portalAccount.status).toBe("ACTIVE");

    const chartOnly = await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", admin.cookie)
      .send({
        dietitianAccountId: practice.id,
        firstName: "Bob",
        lastName: "Chart",
        email: email("chart"),
        inviteToPortal: false,
      })
      .expect(201);
    expect(chartOnly.body.invitationSent).toBe(false);
    expect(chartOnly.body.portalUser).toBeNull();

    const noEmail = await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", admin.cookie)
      .send({
        dietitianAccountId: practice.id,
        firstName: "Cara",
        lastName: "Offline",
      })
      .expect(201);
    expect(noEmail.body.invitationSent).toBe(false);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", admin.cookie)
      .send({
        dietitianAccountId: practice.id,
        firstName: "Dan",
        lastName: "Bad",
        inviteToPortal: true,
      })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(ADMIN_MESSAGES.inviteRequiresEmail));
  });

  it("blocks patient provision on suspended dietitian and keeps practice isolation", async () => {
    const admin = await makeAdmin();
    const ownerA = await registerVerifyLogin(email("ownA"));
    const ownerB = await registerVerifyLogin(email("ownB"));
    const practiceA = await createPractice(ownerA.cookie, "Practice A");
    const practiceB = await createPractice(ownerB.cookie, "Practice B");

    await ctx.prisma.dietitianAccount.update({
      where: { id: practiceA.id },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });

    await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", admin.cookie)
      .send({
        dietitianAccountId: practiceA.id,
        firstName: "Blocked",
        lastName: "Patient",
      })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_UNAVAILABLE));

    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/admin/patients")
      .set("Cookie", admin.cookie)
      .send({
        dietitianAccountId: practiceB.id,
        firstName: "Ok",
        lastName: "Patient",
      })
      .expect(201);

    expect(created.body.client.dietitianAccountId).toBe(practiceB.id);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${created.body.client.id}`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${practiceB.id}/clients/${created.body.client.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(200);
  });
});
