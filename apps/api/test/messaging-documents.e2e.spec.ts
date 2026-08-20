import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { CLIENT_ACCESS_DENIED } from "../src/clients/client.messages";
import {
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

// Minimal valid PDF header
const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8");

describe("Phase 9 messaging and documents", () => {
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
      .post("/api/v1/organizations")
      .set("Cookie", cookie)
      .send({ name, settings: SETTINGS })
      .expect(201);
    const plan = await ctx.prisma.plan.findUniqueOrThrow({ where: { slug: "standard" } });
    await ctx.prisma.subscription.create({
      data: { organizationId: created.body.id, planId: plan.id, status: "ACTIVE" },
    });
    return created.body as { id: string };
  }

  async function createClient(cookie: string, organizationId: string, body: Record<string, unknown> = {}) {
    return request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Cookie", cookie)
      .send({ firstName: "Pat", lastName: "Client", email: email("client"), ...body });
  }

  it("isolates messaging and documents between organizations", async () => {
    const ownerA = await registerVerifyLogin();
    const ownerB = await registerVerifyLogin();
    const orgA = await createOrg(ownerA.cookie, "Clinic A");
    const orgB = await createOrg(ownerB.cookie, "Clinic B");
    const clientA = await createClient(ownerA.cookie, orgA.id);
    const clientB = await createClient(ownerB.cookie, orgB.id);
    const portalA = await connectClientPortal(ctx, ownerA.cookie, orgA.id, clientA.body);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/conversation/messages")
      .set("Cookie", portalA)
      .send({ body: "Hello from client A" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}/clients/${clientB.body.id}/conversation/messages`)
      .set("Cookie", ownerA.cookie)
      .expect(403);

    const internal = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${orgA.id}/clients/${clientA.body.id}/documents`)
      .set("Cookie", ownerA.cookie)
      .attach("file", PDF_BUFFER, { filename: "lab.pdf", contentType: "application/pdf" })
      .field("visibility", "INTERNAL")
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${orgB.id}/clients/${clientB.body.id}/documents/${internal.body.id}/download`)
      .set("Cookie", ownerB.cookie)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/documents/${internal.body.id}/download`)
      .set("Cookie", portalA)
      .expect(404);
  });

  it("enforces assignment rules and shared document access", async () => {
    const owner = await registerVerifyLogin();
    const dietitian = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Practice");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: dietitian.address, role: "DIETITIAN" })
      .expect(201);
    const assigned = await createClient(owner.cookie, org.id);
    const unassigned = await createClient(owner.cookie, org.id);
    const portalAssigned = await connectClientPortal(ctx, owner.cookie, org.id, assigned.body);
    const portalOther = await connectClientPortal(ctx, owner.cookie, org.id, unassigned.body);

    const shared = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/documents`)
      .set("Cookie", owner.cookie)
      .attach("file", PDF_BUFFER, { filename: "plan.pdf", contentType: "application/pdf" })
      .field("visibility", "SHARED")
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/documents/${shared.body.id}/download`)
      .set("Cookie", portalAssigned)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/documents/${shared.body.id}/download`)
      .set("Cookie", portalOther)
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${unassigned.body.id}/conversation/messages`)
      .set("Cookie", dietitian.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCESS_DENIED));

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${assigned.body.id}/conversation/messages`)
      .set("Cookie", owner.cookie)
      .send({ body: "Follow up on labs" })
      .expect(201);

    const notifications = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/notifications")
      .set("Cookie", portalAssigned)
      .expect(200);
    expect(notifications.body.some((row: { type: string }) => row.type === "NEW_MESSAGE")).toBe(true);
  });

  it("rejects unsupported uploads and blocks archived document access", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Clinic");
    const client = await createClient(owner.cookie, org.id);
    const portal = await connectClientPortal(ctx, owner.cookie, org.id, client.body);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/documents`)
      .set("Cookie", owner.cookie)
      .attach("file", Buffer.from("not a real pdf"), { filename: "bad.pdf", contentType: "application/pdf" })
      .expect(415);

    const doc = await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/documents`)
      .set("Cookie", owner.cookie)
      .attach("file", PDF_BUFFER, { filename: "shared.pdf", contentType: "application/pdf" })
      .field("visibility", "SHARED")
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/organizations/${org.id}/clients/${client.body.id}/documents/${doc.body.id}/archive`)
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/portal/documents/${doc.body.id}/download`)
      .set("Cookie", portal)
      .expect(404);

    const timeline = await request(ctx.app.getHttpServer())
      .get(`/api/v1/organizations/${org.id}/clients/${client.body.id}/timeline`)
      .set("Cookie", owner.cookie)
      .expect(200);
    const types = timeline.body.map((row: { type: string }) => row.type);
    expect(types).toContain("DOCUMENT_UPLOADED");
    expect(types).toContain("DOCUMENT_ARCHIVED");
  });
});
