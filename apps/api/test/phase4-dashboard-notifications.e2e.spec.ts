import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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

describe("phase4 dashboard + notifications gaps", () => {
  let ctx: AuthTestContext;
  let seq = 0;
  const clock = new Date("2026-08-20T12:00:00.000Z");

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

  function email(prefix = "p4"): string {
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

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
  }

  async function createClient(cookie: string, dietitianAccountId: string, clientEmail?: string) {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${dietitianAccountId}/clients`)
      .set("Cookie", cookie)
      .send({
        firstName: "Pat",
        lastName: "Client",
        email: clientEmail ?? email("client"),
      })
      .expect(201);
    return res.body as { id: string; email: string };
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

  function breakfastMeal(version: { snapshot: { days: Array<{ meals: Array<{ id: string; name: string }> }> } }) {
    const meal = version.snapshot.days[0]?.meals.find((row) => row.name === "Breakfast") ?? version.snapshot.days[0]?.meals[0];
    if (!meal) throw new Error("Missing breakfast meal");
    return meal;
  }

  it("returns clientLimit, unreadMessageCount, and appointment endAt/status without cross-tenant leakage", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const orgA = await createOrg(a.cookie, "Practice A");
    const orgB = await createOrg(b.cookie, "Practice B");
    const clientA = await createClient(a.cookie, orgA.id);
    const clientB = await createClient(b.cookie, orgB.id);
    const portalA = await connectClientPortal(ctx, a.cookie, orgA.id, clientA);

    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/appointments`)
      .set("Cookie", a.cookie)
      .send({ title: "Check-in", startAt: start.toISOString(), endAt: end.toISOString() })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/conversation/messages")
      .set("Cookie", portalA)
      .send({ body: "Hello from patient" })
      .expect(201);

    const dashA = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/practice/dashboard`)
      .set("Cookie", a.cookie)
      .expect(200);

    expect(dashA.body.clientCount).toBe(1);
    expect(dashA.body.clientLimit).toBe(25);
    expect(dashA.body.unreadMessageCount).toBeGreaterThanOrEqual(1);
    expect(dashA.body.upcomingAppointments.length + dashA.body.todayAppointments.length).toBeGreaterThanOrEqual(1);
    const appt =
      dashA.body.todayAppointments[0] ?? dashA.body.upcomingAppointments[0];
    expect(appt.endAt).toBeTruthy();
    expect(appt.status).toBe("SCHEDULED");
    expect(dashA.body.recentConversations.every((row: { clientId: string }) => row.clientId === clientA.id)).toBe(true);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/practice/dashboard`)
      .set("Cookie", a.cookie)
      .expect(403);

    const dashB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/practice/dashboard`)
      .set("Cookie", b.cookie)
      .expect(200);
    expect(dashB.body.clientCount).toBe(1);
    expect(dashB.body.unreadMessageCount).toBe(0);
    expect(
      [...dashB.body.todayAppointments, ...dashB.body.upcomingAppointments].every(
        (row: { clientId: string }) => row.clientId === clientB.id,
      ),
    ).toBe(true);
  });

  it("notifies patient on meal plan notify and keeps notification APIs isolated", async () => {
    const owner = await registerVerifyLogin(email("own"));
    const other = await registerVerifyLogin(email("oth"));
    const org = await createOrg(owner.cookie, "Notify Practice");
    const otherOrg = await createOrg(other.cookie, "Other Practice");
    const client = await createClient(owner.cookie, org.id);
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client);
    const food = await seedFood();

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/settings`)
      .set("Cookie", owner.cookie)
      .send({
        ...SETTINGS,
        mealPlanShare: {
          emailSubject: "Plan ready for [Client_first_name]",
          emailBody: "Your [Meal_plan_name] is live.",
        },
      })
      .expect(200);

    const plan = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans`)
      .set("Cookie", owner.cookie)
      .send({ clientId: client.id, name: "Week 1" })
      .expect(201);
    const draftId = plan.body.versions[0].id as string;
    const draft = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const breakfast = breakfastMeal(draft.body);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/meals/${breakfast.id}/items`)
      .set("Cookie", owner.cookie)
      .send({ itemType: "FOOD", foodId: food.id, quantity: 100, unit: "g" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/notify`)
      .set("Cookie", owner.cookie)
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toBe("Only a published version can be notified");
      });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/versions/${draftId}/publish`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const beforeNotify = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(
      beforeNotify.body.find(
        (row: { type: string }) => row.type === "MEAL_PLAN_PUBLISHED",
      ),
    ).toBeFalsy();

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/meal-plans/${plan.body.id}/notify`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const portalNotifs = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalCookie)
      .expect(200);
    const mealPlanNotif = portalNotifs.body.find(
      (row: { type: string; targetType?: string | null }) => row.type === "MEAL_PLAN_PUBLISHED",
    );
    expect(mealPlanNotif).toBeTruthy();
    expect(mealPlanNotif.targetType).toBe("meal_plan");
    expect(mealPlanNotif.targetId).toBe(plan.body.id);
    expect(mealPlanNotif.title).toBe("Plan ready for Pat");
    expect(mealPlanNotif.body).toBe("Your Week 1 is live.");

    const unread = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications/unread-count")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(unread.body.count).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/portal/notifications/${mealPlanNotif.id}/read`)
      .set("Cookie", portalCookie)
      .expect(200);

    const markAll = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/notifications/read-all")
      .set("Cookie", portalCookie);
    expect([200, 201]).toContain(markAll.status);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/notifications`)
      .set("Cookie", other.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${otherOrg.id}/notifications`)
      .set("Cookie", owner.cookie)
      .expect(403);
  });

  it("scopes portal notifications to the active ClientAccount connection", async () => {
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

    const startA = new Date(clock.getTime() + 60 * 60 * 1000).toISOString();
    const endA = new Date(clock.getTime() + 2 * 60 * 60 * 1000).toISOString();
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/appointments`)
      .set("Cookie", ownerA.cookie)
      .send({ title: "A visit", startAt: startA, endAt: endA })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect(200);

    const startB = new Date(clock.getTime() + 3 * 60 * 60 * 1000).toISOString();
    const endB = new Date(clock.getTime() + 4 * 60 * 60 * 1000).toISOString();
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/appointments`)
      .set("Cookie", ownerB.cookie)
      .send({ title: "B visit", startAt: startB, endAt: endB })
      .expect(201);

    const notifsB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(
      notifsB.body.some(
        (row: { type: string; dietitianAccountId?: string; body?: string; title?: string }) =>
          row.type === "APPOINTMENT_CREATED" &&
          (String(row.body ?? "").includes("B visit") || String(row.title ?? "").includes("B visit")),
      ),
    ).toBe(true);

    const dashB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/dashboard")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(dashB.body.me.client.id).toBe(clientB.id);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientA.id })
      .expect(200);

    const dashA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/dashboard")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(dashA.body.me.client.id).toBe(clientA.id);

    const notifsA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(notifsA.body.some((row: { type: string }) => row.type === "APPOINTMENT_CREATED")).toBe(true);
  });

  it("rejects unauthenticated dashboard access", async () => {
    const owner = await registerVerifyLogin(email("ua"));
    const org = await createOrg(owner.cookie, "UA Practice");
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/practice/dashboard`)
      .expect(401);
  });
});
