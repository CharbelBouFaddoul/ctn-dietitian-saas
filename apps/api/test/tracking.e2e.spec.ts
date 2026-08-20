import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";
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

describe("Phase 8 client tracking", () => {
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

  function email(prefix = "user"): string {
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

  async function createOrg(cookie: string, name: string, timezone = "UTC") {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: { ...SETTINGS, timezone } })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, organizationId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body });
  }

  async function seedFood(name = "Chicken breast") {
    const source = await ctx.prisma.foodSource.create({
      data: {
        key: `src-${seq}-${name}`,
        name: "Test catalog",
        provider: "Test",
        datasetVersion: "1",
        license: "test",
        attribution: "test",
        importedAt: new Date(),
      },
    });
    return ctx.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: `${name}-${seq}`,
        name,
        nameNormalized: name.toLowerCase(),
        category: "Poultry",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        fiberG: 0,
        sugarG: 0,
        sodiumMg: 74,
        importedAt: new Date(),
      },
    });
  }

  it("isolates tracking between organizations and preserves food log nutrition snapshots", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id);
    const clientB = await createClient(ownerB.cookie, orgB.id);
    const food = await seedFood();
    const portalA = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA.body);

    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portalA)
      .send({ foodId: food.id, quantity: 200, unit: "g" })
      .expect(201);
    expect(created.body.nutrition.energyKcal).toBe(330);

    await request(ctx.app.getHttpServer())
      .put(`/api/v1/dietitian/${orgA.id}/foods/${food.id}/override`)
      .set("Cookie", ownerA.cookie)
      .send({ energyKcal: 180 })
      .expect(200);

    const stored = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/food-logs?date=${created.body.trackingDate}`)
      .set("Cookie", portalA)
      .expect(200);
    expect(stored.body[0].nutrition.energyKcal).toBe(330);

    const edited = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/portal/tracking/food-logs/${created.body.id}`)
      .set("Cookie", portalA)
      .send({ quantity: 100 })
      .expect(200);
    expect(edited.body.nutrition.energyKcal).toBe(180);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/clients/${clientB.body.id}/tracking/summary`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", ownerB.cookie)
      .send({ foodId: food.id, quantity: 100, unit: "g" })
      .expect(403);
  });

  it("enforces owner review access and blocks cross-client portal access", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Practice");

    const client = await createClient(owner.cookie, org.id);
    const other = await createClient(owner.cookie, org.id);

    const food = await seedFood();
    const portal = await connectClientPortal(ctx, owner.cookie, org.id, client.body);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portal)
      .send({ foodId: food.id, quantity: 150, unit: "g" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/tracking/summary`)
      .set("Cookie", outsider.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    const ownerSummary = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/tracking/summary`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(ownerSummary.body.food.presented.energyKcal).toBe(248);

    const otherPortal = await connectClientPortal(ctx, owner.cookie, org.id, other.body);
    const otherSummary = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/tracking/summary")
      .set("Cookie", otherPortal)
      .expect(200);
    expect(otherSummary.body.food.logCount).toBe(0);
  });

  it("calculates water, exercise, sleep, habits, and timeline events", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic", "Asia/Beirut");
    const client = await createClient(owner.cookie, org.id);
    const portal = await connectClientPortal(ctx, owner.cookie, org.id, client.body);
    const date = "2026-08-18";

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", portal)
      .send({ amount: 0.5, unit: "l", loggedAt: "2026-08-18T08:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/water-logs")
      .set("Cookie", portal)
      .send({ amount: 750, unit: "ml", loggedAt: "2026-08-18T12:30:00.000Z" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/exercise-logs")
      .set("Cookie", portal)
      .send({ activityType: "Walking", durationMinutes: 45, performedAt: "2026-08-18T09:00:00.000Z" })
      .expect(201);

    const sleep = await request(ctx.app.getHttpServer())
      .put("/api/v1/portal/tracking/sleep")
      .set("Cookie", portal)
      .send({
        date,
        bedtime: "2026-08-17T21:00:00.000Z",
        wakeTime: "2026-08-18T05:00:00.000Z",
        quality: 4,
      })
      .expect(200);
    expect(sleep.body.durationMinutes).toBe(480);

    await request(ctx.app.getHttpServer())
      .put("/api/v1/portal/tracking/habits")
      .set("Cookie", portal)
      .send({ habitKey: "water_goal", habitLabel: "Drink water", date, completed: true })
      .expect(200);

    const summary = await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/tracking/summary?date=${date}`)
      .set("Cookie", portal)
      .expect(200);
    expect(summary.body.water.totalMl).toBe(1250);
    expect(summary.body.exercise.totalDurationMinutes).toBe(45);
    expect(summary.body.sleep.durationMinutes).toBe(480);
    expect(summary.body.habits.completed).toBe(1);

    const timeline = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const types = timeline.body.map((row: { type: string }) => row.type);
    expect(types).toContain("WATER_LOGGED");
    expect(types).toContain("EXERCISE_LOGGED");
    expect(types).toContain("SLEEP_LOGGED");
    expect(types).toContain("HABIT_COMPLETED");

    await request(ctx.app.getHttpServer())
      .put("/api/v1/portal/tracking/sleep")
      .set("Cookie", portal)
      .send({ date, bedtime: "2026-08-18T05:00:00.000Z", wakeTime: "2026-08-18T04:00:00.000Z" })
      .expect(400);

    expect(await ctx.entitlements.can(org.id, FEATURE_KEYS.AI)).toBe(false);
  });

  it("rejects invalid exercise duration and archives logs", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    const client = await createClient(owner.cookie, org.id);
    const food = await seedFood();
    const portal = await connectClientPortal(ctx, owner.cookie, org.id, client.body);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/exercise-logs")
      .set("Cookie", portal)
      .send({ activityType: "Run", durationMinutes: 0 })
      .expect(400);

    const foodLog = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/tracking/food-logs")
      .set("Cookie", portal)
      .send({ foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/portal/tracking/food-logs/${foodLog.body.id}`)
      .set("Cookie", portal)
      .expect(200);

    const summary = await request(ctx.app.getHttpServer()).get("/api/v1/portal/tracking/summary").set("Cookie", portal).expect(200);
    expect(summary.body.food.logCount).toBe(0);
  });
});
