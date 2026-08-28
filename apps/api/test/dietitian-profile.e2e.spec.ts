import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  connectClientPortal,
  cookieValue,
  createAuthTestApp,
  createOrgWithSubscription,
  extractEmailedToken,
  resetAuthDatabase,
  TEST_PASSWORD,
  type AuthTestContext,
} from "./app";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "../src/platform-settings/platform-settings.defaults";

const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("dietitian profile hub", () => {
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

  function email(prefix: string) {
    seq += 1;
    return `${prefix}${seq}@example.com`;
  }

  async function registerVerifyLogin(address = email("owner"), names?: { firstName: string; lastName: string }) {
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: TEST_PASSWORD, ...names })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
  }

  it("returns names on auth/me after a profile save", async () => {
    const owner = await registerVerifyLogin(email("me"), { firstName: "Dana", lastName: "Diet" });
    const org = await createOrgWithSubscription(ctx, owner.cookie, "Name Clinic");

    const patched = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}`)
      .set("Cookie", owner.cookie)
      .send({
        firstName: "Alex",
        lastName: "Nguyen",
        professionalTitle: "Nutritionist",
        specialization: "Sports",
        phone: "+961100000",
        country: "Lebanon",
        licenseNumber: "RD-12",
      })
      .expect(200);
    expect(patched.body.firstName).toBe("Alex");
    expect(patched.body.lastName).toBe("Nguyen");
    expect(patched.body.professionalTitle).toBe("Nutritionist");
    expect(patched.body.licenseNumber).toBe("RD-12");

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", owner.cookie).expect(200);
    expect(me.body.user.firstName).toBe("Alex");
    expect(me.body.user.lastName).toBe("Nguyen");
  });

  it("blocks another dietitian from patching this profile", async () => {
    const a = await registerVerifyLogin();
    const b = await registerVerifyLogin();
    const org = await createOrgWithSubscription(ctx, a.cookie, "Private Clinic");
    await createOrgWithSubscription(ctx, b.cookie, "Other Clinic");

    const blocked = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}`)
      .set("Cookie", b.cookie)
      .send({ firstName: "Hacker" });
    expect(blocked.status).toBe(403);

    const unknown = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}`)
      .set("Cookie", a.cookie)
      .send({ firstName: "Alex", extraField: "nope" });
    expect(unknown.status).toBe(400);
  });

  it("saves clinic preferences JSON and rejects invalid units and measurements", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrgWithSubscription(ctx, owner.cookie, "Prefs Clinic");

    const saved = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({
        ...SETTINGS,
        weightUnit: "lb",
        heightUnit: "in",
        energyUnit: "kj",
        appointmentReminders: [1, 24, 72],
        mealPlanShare: {
          emailSubject: "Your plan",
          emailBody: "Hi [Client_first_name]",
          includeSections: ["meals", "signature"],
          mealLabels: ["Dish", "Dessert"],
        },
        enabledMeasurements: ["WEIGHT", "HEIGHT", "NECK"],
        deduceMeasurements: false,
        portalPresets: { messaging: false, tracking: true, mealPlans: true },
      })
      .expect(200);
    expect(saved.body.weightUnit).toBe("lb");
    expect(saved.body.heightUnit).toBe("in");
    expect(saved.body.energyUnit).toBe("kj");
    expect(saved.body.appointmentReminders).toEqual([1, 24, 72]);
    expect(saved.body.reminderHoursBefore).toBe(1);
    expect(saved.body.mealPlanShare.includeSections).toEqual(["meals", "signature"]);
    expect(saved.body.enabledMeasurements).toEqual(["WEIGHT", "HEIGHT", "NECK"]);
    expect(saved.body.deduceMeasurements).toBe(false);
    expect(saved.body.portalPresets.messaging).toBe(false);

    const badUnit = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({ ...SETTINGS, energyUnit: "calories" });
    expect(badUnit.status).toBe(400);

    const badMeasurement = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({ ...SETTINGS, enabledMeasurements: ["AURA"] });
    expect(badMeasurement.status).toBe(400);

    const badSection = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({ ...SETTINGS, mealPlanShare: { includeSections: ["watermark"] } });
    expect(badSection.status).toBe(400);
  });

  it("changes password and revokes other sessions while keeping the current one", async () => {
    const address = email("sessions");
    const owner = await registerVerifyLogin(address);
    await createOrgWithSubscription(ctx, owner.cookie, "Secure Clinic");

    const wrong = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set("Cookie", owner.cookie)
      .send({ currentPassword: "WrongPass12", newPassword: "ValidPass99" });
    expect(wrong.status).toBe(401);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .set("Cookie", owner.cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "ValidPass99" })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(401);

    const first = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: "ValidPass99" })
      .expect(200);
    const second = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: "ValidPass99" })
      .expect(200);
    const cookieA = `ns_session=${cookieValue(first.headers["set-cookie"])}`;
    const cookieB = `ns_session=${cookieValue(second.headers["set-cookie"])}`;

    await request(ctx.app.getHttpServer()).post("/api/v1/auth/sessions/revoke-others").set("Cookie", cookieA).expect(200);
    await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookieA).expect(200);
    await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookieB).expect(401);
  });

  it("changes login email with the current password even when registration is off", async () => {
    const address = email("oldmail");
    const owner = await registerVerifyLogin(address);
    await createOrgWithSubscription(ctx, owner.cookie, "Email Clinic");
    const other = await registerVerifyLogin();
    await ctx.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
      data: { dietitianRegistrationEnabled: false },
    });

    const nextAddress = email("newmail");
    const wrong = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/change-email")
      .set("Cookie", owner.cookie)
      .send({ email: nextAddress, currentPassword: "WrongPass12" });
    expect(wrong.status).toBe(401);

    const taken = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/change-email")
      .set("Cookie", owner.cookie)
      .send({ email: other.address, currentPassword: TEST_PASSWORD });
    expect(taken.status).toBe(400);

    const changed = await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/change-email")
      .set("Cookie", owner.cookie)
      .send({ email: nextAddress, currentPassword: TEST_PASSWORD })
      .expect(200);
    expect(changed.body.email).toBe(nextAddress);

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", owner.cookie).expect(200);
    expect(me.body.user.email).toBe(nextAddress);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: nextAddress, password: TEST_PASSWORD })
      .expect(200);
  });

  it("shows the updated dietitian name in the portal", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrgWithSubscription(ctx, owner.cookie, "Portal Clinic");
    const client = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client") })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}`)
      .set("Cookie", owner.cookie)
      .send({
        firstName: "Maya",
        lastName: "Khoury",
        professionalTitle: "Nutritionist",
        specialization: "Sports nutrition",
      })
      .expect(200);

    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, {
      id: client.body.id,
      email: client.body.email,
    });
    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", portalCookie).expect(200);
    expect(me.body.dietitianDisplayName).toBe("Maya Khoury");
    expect(me.body.dietitian).toEqual({
      name: "Maya Khoury",
      title: "Nutritionist",
      specialization: "Sports nutrition",
    });
    expect(me.body.portalPresets.messaging).toBe(true);
  });
});
