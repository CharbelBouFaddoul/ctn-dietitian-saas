import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";

const PASSWORD = "ValidPass12";
const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("Phase 10 invoices, tasks, and analytics", () => {
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

  async function createOrg(cookie: string, name: string) {
    const created = await request(ctx.app.getHttpServer())
      .post("/api/v1/dietitian")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
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

  it("runs invoice lifecycle with server totals and unique numbering", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Billing Clinic");
    const client = await createClient(owner.cookie, org.id);
    const portal = await connectClientPortal(ctx, owner.cookie, org.id, client.body);

    const draft = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/invoices`)
      .set("Cookie", owner.cookie)
      .send({
        items: [
          { description: "Consultation", quantity: 2, unitPrice: 75 },
          { description: "Follow-up", quantity: 1, unitPrice: 50 },
        ],
      })
      .expect(201);

    expect(draft.body.total).toBe(200);
    expect(draft.body.status).toBe("DRAFT");

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/invoices")
      .set("Cookie", portal)
      .expect(200)
      .expect((res) => expect(res.body).toHaveLength(0));

    const issued = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/invoices/${draft.body.id}/issue`)
      .set("Cookie", owner.cookie)
      .expect(201);

    expect(issued.body.invoiceNumber).toBe("INV-000001");

    const secondDraft = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/invoices`)
      .set("Cookie", owner.cookie)
      .send({
        clientId: client.body.id,
        items: [{ description: "Plan review", quantity: 1, unitPrice: 40 }],
      })
      .expect(201);

    const secondIssued = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/invoices/${secondDraft.body.id}/issue`)
      .set("Cookie", owner.cookie)
      .expect(201);

    expect(secondIssued.body.invoiceNumber).toBe("INV-000002");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/invoices/${issued.body.id}/send`)
      .set("Cookie", owner.cookie)
      .expect(201);

    const portalList = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/invoices")
      .set("Cookie", portal)
      .expect(200);
    expect(portalList.body.some((row: { id: string }) => row.id === issued.body.id)).toBe(true);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/invoices/${issued.body.id}/pay`)
      .set("Cookie", owner.cookie)
      .expect(201)
      .expect((res) => expect(res.body.status).toBe("PAID"));

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/dietitian/${org.id}/invoices/${issued.body.id}`)
      .set("Cookie", owner.cookie)
      .send({ notes: "Should fail" })
      .expect(400);
  });

  it("isolates invoices and tasks between dietitian accounts", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Org A");
    const orgB = await createOrg(ownerB.cookie, "Org B");

    const clientA = await createClient(ownerA.cookie, orgA.id);
    const clientB = await createClient(ownerB.cookie, orgB.id);

    const invoiceA = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.body.id}/invoices`)
      .set("Cookie", ownerA.cookie)
      .send({ items: [{ description: "Service", quantity: 1, unitPrice: 10 }] })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/invoices/${invoiceA.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientB.body.id}/invoices`)
      .set("Cookie", ownerA.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/clients/${clientA.body.id}/invoices`)
      .set("Cookie", outsider.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));

    const task = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/tasks`)
      .set("Cookie", ownerA.cookie)
      .send({ title: "Call client", clientId: clientA.body.id })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/tasks/${task.body.id}`)
      .set("Cookie", ownerB.cookie)
      .expect(404);
  });

  it("returns analytics aggregates with tenant scoping", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Analytics A");
    const orgB = await createOrg(ownerB.cookie, "Analytics B");
    const clientA = await createClient(ownerA.cookie, orgA.id);
    await createClient(ownerB.cookie, orgB.id);

    const draft = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/clients/${clientA.body.id}/invoices`)
      .set("Cookie", ownerA.cookie)
      .send({ items: [{ description: "Session", quantity: 1, unitPrice: 120 }] })
      .expect(201);

    const issued = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/invoices/${draft.body.id}/issue`)
      .set("Cookie", ownerA.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/invoices/${issued.body.id}/pay`)
      .set("Cookie", ownerA.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgA.id}/tasks`)
      .set("Cookie", ownerA.cookie)
      .send({ title: "Prepare report", clientId: clientA.body.id })
      .expect(201);

    const overviewA = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgA.id}/analytics/overview?period=this_month`)
      .set("Cookie", ownerA.cookie)
      .expect(200);

    expect(overviewA.body.activeClients).toBeGreaterThanOrEqual(1);
    expect(overviewA.body.paidAmount).toBeGreaterThanOrEqual(120);

    const overviewB = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${orgB.id}/analytics/overview?period=this_month`)
      .set("Cookie", ownerB.cookie)
      .expect(200);

    expect(overviewB.body.paidAmount).toBe(0);
  });
});
