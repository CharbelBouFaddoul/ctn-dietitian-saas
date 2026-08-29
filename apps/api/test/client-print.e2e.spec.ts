import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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
const MISSING_CLIENT = "00000000-0000-4000-8000-000000000000";
const PRINT_DOCS = [
  "clinical",
  "assessments",
  "measurement",
  "tracking",
  "prescription",
  "nutrition",
  "nutrition-analysis",
] as const;
const BODY_KEYS: Record<(typeof PRINT_DOCS)[number], string[]> = {
  clinical: ["sections", "goals", "documents"],
  assessments: ["submitted", "inProgress"],
  measurement: ["latest", "history"],
  tracking: ["from", "to", "days"],
  prescription: ["current", "goals", "energy", "macros", "duration"],
  nutrition: ["plan", "days"],
  "nutrition-analysis": ["plan", "targets", "targetsFromClient", "days"],
};

describe("client chart print payload", () => {
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

  function email(prefix = "print"): string {
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

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    await activateStandardSubscription(ctx.prisma, created.body.id);
    return created.body as { id: string };
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

  function printPath(orgId: string, clientId: string, doc?: string) {
    const query = doc ? `?doc=${doc}` : "";
    return `/api/v1/dietitian/${orgId}/clients/${clientId}/print${query}`;
  }

  it("returns header fields, each doc body, and denies missing or cross-tenant clients", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const orgA = await createOrg(a.cookie, "Print Practice");
    const orgB = await createOrg(b.cookie, "Other Practice");
    const client = await createClient(a.cookie, orgA.id, {
      firstName: "Ann",
      lastName: "River",
      dateOfBirth: "1990-06-15",
      email: "ann.river@example.com",
    });

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}`)
      .set("Cookie", a.cookie)
      .send({ professionalTitle: "Dietitian", specialization: "Sports" })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}/settings`)
      .set("Cookie", a.cookie)
      .send({
        ...SETTINGS,
        practiceName: "Harbor Clinic",
        contactEmail: "clinic@harbor.example",
        addressLine1: "12 Shore Rd",
        city: "Beirut",
        country: "Lebanon",
      })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${client.id}/measurements`)
      .set("Cookie", a.cookie)
      .send({ type: "WEIGHT", value: 80, unit: "kg", measuredAt: "2026-01-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${client.id}/measurements`)
      .set("Cookie", a.cookie)
      .send({ type: "HEIGHT", value: 170, unit: "cm", measuredAt: "2026-01-01T12:00:00.000Z" })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${orgA.id}/clients/${client.id}/profile`)
      .set("Cookie", a.cookie)
      .send({
        clinicalData: {
          visit: { reason: "Energy" },
          prescription: { weightGoalKg: 72, energyGoalKcal: 1800, macro: { proteinPct: 30 } },
        },
      })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${client.id}/goals`)
      .set("Cookie", a.cookie)
      .send({ title: "Walk daily" })
      .expect(201);

    const template = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates`)
      .set("Cookie", a.cookie)
      .send({
        name: "Intake",
        schema: {
          sections: [
            {
              id: "main",
              questions: [{ id: "reason", type: "TEXT", label: "Reason", required: false, active: true }],
            },
          ],
        },
      })
      .expect(201);
    const started = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${client.id}/assessments`)
      .set("Cookie", a.cookie)
      .send({ templateId: template.body.id })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${client.id}/assessments/${started.body.id}/complete`)
      .set("Cookie", a.cookie)
      .send({ responses: { reason: "fatigue" } })
      .expect(201);

    const clinical = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "clinical"))
      .set("Cookie", a.cookie)
      .expect(200);

    expect(clinical.body.title).toBe("Clinical profile");
    expect(clinical.body.doc).toBe("clinical");
    expect(clinical.body.practice.practiceName).toBe("Harbor Clinic");
    expect(clinical.body.practice.contactEmail).toBe("clinic@harbor.example");
    expect(clinical.body.practice.address).toContain("12 Shore Rd");
    expect(clinical.body.practice.address).toContain("Beirut");
    expect(clinical.body.dietitian.title).toBe("Dietitian");
    expect(clinical.body.dietitian.specialization).toBe("Sports");
    expect(clinical.body.dietitian.email).toBe("clinic@harbor.example");
    expect(clinical.body.client.name).toContain("Ann");
    expect(clinical.body.client.email).toBe("ann.river@example.com");
    expect(clinical.body.client.ageYears).toBeGreaterThanOrEqual(35);
    expect(clinical.body.client.bmi).toBe(27.7);
    expect(clinical.body.client.height).toEqual({ value: 170, unit: "cm" });
    expect(clinical.body.client.weight).toEqual({ value: 80, unit: "kg" });
    expect(clinical.body.generatedAt).toBeTruthy();
    expect(clinical.body.body.goals[0].title).toBe("Walk daily");
    expect(clinical.body.body.sections.some((section: { title: string }) => section.title === "Visit")).toBe(true);
    const identity = clinical.body.body.sections.find((section: { title: string }) => section.title === "Identity");
    expect(identity.fields.some((field: { label: string }) => field.label === "Age")).toBe(true);

    for (const doc of PRINT_DOCS) {
      const res = await request(ctx.app.getHttpServer())
        .get(printPath(orgA.id, client.id, doc))
        .set("Cookie", a.cookie)
        .expect(200);
      expect(res.body.doc).toBe(doc);
      expect(res.body.practice.practiceName).toBe("Harbor Clinic");
      for (const key of BODY_KEYS[doc]) {
        expect(res.body.body).toHaveProperty(key);
      }
    }

    const assessments = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "assessments"))
      .set("Cookie", a.cookie)
      .expect(200);
    expect(assessments.body.body.submitted[0].name).toBe("Intake");
    expect(assessments.body.body.submitted[0].questions[0].answer).toBe("fatigue");

    const measurement = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "measurement"))
      .set("Cookie", a.cookie)
      .expect(200);
    expect(measurement.body.body.latest.some((row: { type: string }) => row.type === "WEIGHT")).toBe(true);

    const prescription = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "prescription"))
      .set("Cookie", a.cookie)
      .expect(200);
    expect(prescription.body.body.goals.weightKg).toBe(72);
    expect(prescription.body.body.macros.proteinPct).toBe(30);

    const emptyNutrition = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "nutrition"))
      .set("Cookie", a.cookie)
      .expect(200);
    expect(emptyNutrition.body.body.plan).toBeNull();
    expect(emptyNutrition.body.body.days).toEqual([]);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/meal-plans`)
      .set("Cookie", a.cookie)
      .send({ name: "Week 1", clientId: client.id })
      .expect(201);
    const nutrition = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "nutrition"))
      .set("Cookie", a.cookie)
      .expect(200);
    expect(nutrition.body.body.plan.name).toBe("Week 1");
    const analysis = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "nutrition-analysis"))
      .set("Cookie", a.cookie)
      .expect(200);
    expect(analysis.body.title).toBe("Nutrition analysis");
    expect(analysis.body.body.plan.name).toBe("Week 1");
    expect(analysis.body.body.targets.energyKcal).toBe(2000);
    expect(analysis.body.body.days.length).toBeLessThanOrEqual(1);

    await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id))
      .set("Cookie", a.cookie)
      .expect(400);
    await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "invoice"))
      .set("Cookie", a.cookie)
      .expect(400);

    const missing = await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, MISSING_CLIENT, "clinical"))
      .set("Cookie", a.cookie);
    expect([403, 404]).toContain(missing.status);

    await request(ctx.app.getHttpServer())
      .get(printPath(orgA.id, client.id, "clinical"))
      .set("Cookie", b.cookie)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(printPath(orgB.id, client.id, "clinical"))
      .set("Cookie", a.cookie)
      .expect(403);
  });
});
