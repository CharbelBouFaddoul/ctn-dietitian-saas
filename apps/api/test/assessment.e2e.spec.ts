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

describe("assessment evaluation hardening", () => {
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

  function email(prefix = "ae"): string {
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

  const richSchema = {
    sections: [
      {
        id: "main",
        title: "Questions",
        questions: [
          { id: "goal", type: "TEXT", label: "Goal", required: true, active: true },
          { id: "meals", type: "NUMBER", label: "Meals", required: true, active: true },
          {
            id: "allergy",
            type: "BOOLEAN",
            label: "Allergies",
            required: false,
            active: true,
          },
          {
            id: "diet",
            type: "SINGLE_CHOICE",
            label: "Diet",
            required: true,
            active: true,
            options: [
              { id: "veg", label: "Vegetarian" },
              { id: "omni", label: "Omnivore" },
            ],
          },
          {
            id: "avoid",
            type: "MULTI_CHOICE",
            label: "Avoid",
            required: false,
            active: true,
            options: [
              { id: "dairy", label: "Dairy" },
              { id: "nuts", label: "Nuts" },
            ],
          },
        ],
      },
    ],
  };

  it("manages template questions and denies cross-tenant template access", async () => {
    const owner = await registerVerifyLogin(email("oa"));
    const other = await registerVerifyLogin(email("ob"));
    const org = await createOrg(owner.cookie, "Practice A");
    await createOrg(other.cookie, "Practice B");

    const template = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates`)
      .set("Cookie", owner.cookie)
      .send({ name: "Patient Evaluation", schema: richSchema })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}/questions`)
      .set("Cookie", owner.cookie)
      .send({
        sectionId: "main",
        id: "notes",
        type: "TEXTAREA",
        label: "Notes",
        required: false,
        active: true,
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}/questions/reorder`)
      .set("Cookie", owner.cookie)
      .send({ sectionId: "main", orderedIds: ["notes", "goal", "meals", "allergy", "diet", "avoid"] })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}/questions/notes/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const got = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const notes = got.body.schema.sections[0].questions.find((q: { id: string }) => q.id === "notes");
    expect(notes?.active).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  it("validates answers, enforces immutability, and freezes snapshot after template edits", async () => {
    const owner = await registerVerifyLogin(email("val"));
    const org = await createOrg(owner.cookie, "Validation Clinic");
    const client = await createClient(owner.cookie, org.id);

    const template = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates`)
      .set("Cookie", owner.cookie)
      .send({ name: "Eval", schema: richSchema })
      .expect(201);

    const started = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/assessments`)
      .set("Cookie", owner.cookie)
      .send({ templateId: template.body.id })
      .expect(201);
    expect(started.body.schemaSnapshot).toBeTruthy();
    const assessmentId = started.body.id as string;
    const base = `/api/v1/dietitian/${org.id}/clients/${client.id}/assessments/${assessmentId}`;

    await request(ctx.app.getHttpServer())
      .patch(base)
      .set("Cookie", owner.cookie)
      .send({ responses: { meals: "abc" } })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .patch(base)
      .set("Cookie", owner.cookie)
      .send({ responses: { diet: "keto" } })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .patch(base)
      .set("Cookie", owner.cookie)
      .send({ responses: { avoid: ["shellfish"] } })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .patch(base)
      .set("Cookie", owner.cookie)
      .send({ responses: { goal: "Lose weight", meals: 3 } })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`${base}/complete`)
      .set("Cookie", owner.cookie)
      .send({})
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post(`${base}/complete`)
      .set("Cookie", owner.cookie)
      .send({
        responses: {
          goal: "Lose weight",
          meals: 3,
          diet: "veg",
          allergy: true,
          avoid: ["dairy"],
        },
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .patch(base)
      .set("Cookie", owner.cookie)
      .send({ responses: { goal: "hacked" } })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post(`${base}/complete`)
      .set("Cookie", owner.cookie)
      .send({ responses: { goal: "Lose weight", meals: 3, diet: "veg" } })
      .expect(400);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}/questions/goal/deactivate`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}/questions`)
      .set("Cookie", owner.cookie)
      .send({
        sectionId: "main",
        id: "extra",
        type: "TEXT",
        label: "Brand new",
        required: true,
        active: true,
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/assessment-templates/${template.body.id}/questions`)
      .set("Cookie", owner.cookie)
      .send({
        sectionId: "main",
        id: "diet",
        type: "SINGLE_CHOICE",
        label: "Diet style (changed)",
        required: true,
        active: true,
        options: [
          { id: "veg", label: "Vegetarian" },
          { id: "vegan", label: "Vegan" },
        ],
      })
      .expect(201);

    const historical = await request(ctx.app.getHttpServer())
      .get(base)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(historical.body.status).toBe("COMPLETED");
    const qIds = historical.body.schema.sections[0].questions.map((q: { id: string }) => q.id);
    expect(qIds).toContain("goal");
    expect(qIds).not.toContain("extra");
    const diet = historical.body.schema.sections[0].questions.find((q: { id: string }) => q.id === "diet");
    expect(diet.label).toBe("Diet");
    expect(diet.options.map((o: { id: string }) => o.id)).toEqual(["veg", "omni"]);
    expect(historical.body.responses).toEqual({
      goal: "Lose weight",
      meals: 3,
      diet: "veg",
      allergy: true,
      avoid: ["dairy"],
    });
  });

  it("isolates portal assessments by activeClientId and rejects forged ids", async () => {
    const ownerA = await registerVerifyLogin(email("ia"));
    const ownerB = await registerVerifyLogin(email("ib"));
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id, { firstName: "Ann" });
    const clientB = await createClient(ownerB.cookie, orgB.id, { firstName: "Ben" });

    const templateA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/assessment-templates`)
      .set("Cookie", ownerA.cookie)
      .send({
        name: "A Eval",
        schema: {
          sections: [
            {
              id: "main",
              questions: [{ id: "q1", type: "TEXT", label: "A Q", required: true, active: true }],
            },
          ],
        },
      })
      .expect(201);
    const templateB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/assessment-templates`)
      .set("Cookie", ownerB.cookie)
      .send({
        name: "B Eval",
        schema: {
          sections: [
            {
              id: "main",
              questions: [{ id: "q1", type: "TEXT", label: "B Q", required: true, active: true }],
            },
          ],
        },
      })
      .expect(201);

    const startedA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.id}/assessments`)
      .set("Cookie", ownerA.cookie)
      .send({ templateId: templateA.body.id })
      .expect(201);
    const startedB = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/assessments`)
      .set("Cookie", ownerB.cookie)
      .send({ templateId: templateB.body.id })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientB.id}/assessments`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/assessments/${startedB.body.id}`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    const portalCookie = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA);
    const { code } = await generateJoinCode(ctx, ownerB.cookie, orgB.id, clientB.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalCookie)
      .send({ code })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientA.id })
      .expect(200);

    const listA = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/assessments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(listA.body.map((r: { id: string }) => r.id)).toEqual([startedA.body.id]);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/assessments/${startedB.body.id}`)
      .set("Cookie", portalCookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/portal/assessments/${startedB.body.id}`)
      .set("Cookie", portalCookie)
      .send({ responses: { q1: "nope" } })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/portal/assessments/${startedB.body.id}/complete`)
      .set("Cookie", portalCookie)
      .send({ responses: { q1: "nope" } })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/portal/assessments/${startedA.body.id}`)
      .set("Cookie", portalCookie)
      .send({ responses: { q1: "partial" } })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect(200);

    const listB = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/assessments")
      .set("Cookie", portalCookie)
      .expect(200);
    expect(listB.body.map((r: { id: string }) => r.id)).toEqual([startedB.body.id]);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/assessments/${startedA.body.id}`)
      .set("Cookie", portalCookie)
      .expect(404);
  });
});
