import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import {
  CLIENT_ACCOUNT_EXISTS,
  CLIENT_LIMIT_REACHED,
  JOIN_ALREADY_CONNECTED,
  JOIN_CODE_EXPIRED,
  JOIN_CODE_INVALID,
  JOIN_CODE_USED,
  JOIN_NOT_ALLOWED,
} from "../src/clients/client.messages";
import {
  activateStandardSubscription,
  connectClientPortal,
  createAuthTestApp,
  extractEmailedToken,
  generateJoinCode,
  generatePracticeJoinCode,
  registerVerifyLoginUser,
  resetAuthDatabase,
  TEST_PASSWORD,
  type AuthTestContext,
} from "./app";
import { DIETITIAN_ACCESS_DENIED } from "../src/dietitian/dietitian.types";

const SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
};

describe("client join codes", () => {
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
    return registerVerifyLoginUser(ctx, address);
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
      .send({ firstName: "Ada", lastName: "Lovelace", email: email("client"), ...body });
  }

  it("lets owners generate codes and forbids other dietitians and outsiders", async () => {
    const owner = await registerVerifyLogin();
    const otherDietitian = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Join Practice");
    const otherOrg = await createOrg(otherDietitian.cookie, "Other Practice");

    const client = await createClient(owner.cookie, org.id);

    const generated = await generateJoinCode(ctx, owner.cookie, org.id, client.body.id);
    expect(generated.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(generated.status).toBe("waiting");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/account/join-code`)
      .set("Cookie", otherDietitian.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.body.id}/account/join-code`)
      .set("Cookie", outsider.cookie)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${otherOrg.id}/clients/${client.body.id}/account/join-code`)
      .set("Cookie", otherDietitian.cookie)
      .expect(403);
  });

  it("requires auth to redeem and reuses the existing client row", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Redeem Practice");
    const clientEmail = email("join");
    const client = await createClient(owner.cookie, org.id, { email: clientEmail, firstName: "Pat" });
    const { code } = await generateJoinCode(ctx, owner.cookie, org.id, client.body.id);

    await request(ctx.app.getHttpServer()).post("/api/v1/portal/join").send({ code }).expect(401);

    const session = await registerVerifyLoginUser(ctx, clientEmail);
    const joined = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code: code.toLowerCase() })
      .expect(201);
    expect(joined.body.status).toBe("connected");

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", session.cookie).expect(200);
    expect(me.body.client.id).toBe(client.body.id);
    expect(me.body.client.firstName).toBe("Pat");

    const rows = await ctx.prisma.client.findMany({
      where: { dietitianAccountId: org.id, email: clientEmail },
    });
    expect(rows).toHaveLength(1);
  });

  it("rejects invalid, used, revoked, and expired codes", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Errors Practice");
    const client = await createClient(owner.cookie, org.id);
    const other = await createClient(owner.cookie, org.id, { firstName: "Other" });
    const session = await registerVerifyLoginUser(ctx, email("unjoined"));

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code: "NOPE-CODE" })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(JOIN_CODE_INVALID));

    const used = await generateJoinCode(ctx, owner.cookie, org.id, client.body.id);
    const redeemer = await registerVerifyLoginUser(ctx, email("redeemer"));
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", redeemer.cookie)
      .send({ code: used.code })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code: used.code })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(JOIN_CODE_USED));

    const toRevoke = await generateJoinCode(ctx, owner.cookie, org.id, other.body.id);
    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/dietitian/${org.id}/clients/${other.body.id}/account/join-code`)
      .set("Cookie", owner.cookie)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code: toRevoke.code })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(JOIN_CODE_INVALID));

    const expiredClient = await createClient(owner.cookie, org.id, { firstName: "Expire" });
    const expired = await generateJoinCode(ctx, owner.cookie, org.id, expiredClient.body.id);
    const invitation = await ctx.prisma.invitationToken.findFirstOrThrow({
      where: { clientId: expiredClient.body.id, purpose: "CLIENT_INVITE", usedAt: null },
    });
    await ctx.prisma.invitationToken.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code: expired.code })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(JOIN_CODE_EXPIRED));
  });

  it("blocks already-connected users and org members, and keeps codes tenant-bound", async () => {
    const owner = await registerVerifyLogin();
    const otherOwner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Bound A");
    const otherOrg = await createOrg(otherOwner.cookie, "Bound B");
    const clientA = await createClient(owner.cookie, org.id);
    const clientB = await createClient(owner.cookie, org.id, { firstName: "B" });
    const otherClient = await createClient(otherOwner.cookie, otherOrg.id);

    const portalA = await connectClientPortal(ctx, owner.cookie, org.id, {
      id: clientA.body.id,
      email: clientA.body.email,
    });
    const codeB = await generateJoinCode(ctx, owner.cookie, org.id, clientB.body.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalA)
      .send({ code: codeB.code })
      .expect(409)
      .expect((res) => expect(res.body.message).toBe(JOIN_ALREADY_CONNECTED));

    const otherCode = await generateJoinCode(ctx, otherOwner.cookie, otherOrg.id, otherClient.body.id);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", portalA)
      .send({ code: otherCode.code })
      .expect(201)
      .expect((res) => expect(res.body.status).toBe("connected"));

    const connections = await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/connections")
      .set("Cookie", portalA)
      .expect(200);
    expect(connections.body).toHaveLength(2);

    await request(ctx.app.getHttpServer())
      .get("/api/v1/portal/onboarding")
      .set("Cookie", owner.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(JOIN_NOT_ALLOWED));
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", owner.cookie)
      .send({ code: otherCode.code })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(JOIN_NOT_ALLOWED));

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${clientA.body.id}/account/join-code`)
      .set("Cookie", owner.cookie)
      .expect(409)
      .expect((res) => expect(res.body.message).toBe(CLIENT_ACCOUNT_EXISTS));
  });

  it("registers with a generic duplicate-email response and password policy", async () => {
    const address = email("dup");
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: "short" })
      .expect(400);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    const token = extractEmailedToken(ctx.emails.last().text);
    await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    const firstCount = ctx.emails.messages.length;
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
    expect(ctx.emails.messages.length).toBe(firstCount);
    await request(ctx.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: address, password: TEST_PASSWORD })
      .expect(200);
  });

  it("lets owners generate a reusable practice code and forbids outsiders", async () => {
    const owner = await registerVerifyLogin();
    const outsider = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Classroom Practice");

    const generated = await generatePracticeJoinCode(ctx, owner.cookie, org.id);
    expect(generated.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(generated.status).toBe("active");

    const viewed = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/join-code`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(viewed.body.code).toBeNull();
    expect(viewed.body.hint).toBe(generated.hint);
    expect(viewed.body.status).toBe("active");

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/join-code`)
      .set("Cookie", outsider.cookie)
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(DIETITIAN_ACCESS_DENIED));
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/join-code`)
      .set("Cookie", outsider.cookie)
      .expect(403);
  });

  it("creates a client on the dietitian dashboard when a registered user redeems a practice code", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Self Serve Practice");
    const { code } = await generatePracticeJoinCode(ctx, owner.cookie, org.id);
    const session = await registerVerifyLoginUser(ctx, email("selfserve"), TEST_PASSWORD, {
      firstName: "Sam",
      lastName: "Taylor",
    });

    const joined = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code })
      .expect(201);
    expect(joined.body.status).toBe("connected");

    const me = await request(ctx.app.getHttpServer()).get("/api/v1/portal/me").set("Cookie", session.cookie).expect(200);
    expect(me.body.client.firstName).toBe("Sam");
    expect(me.body.client.lastName).toBe("Taylor");

    const list = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].firstName).toBe("Sam");
    expect(list.body.items[0].email).toBe(session.address);
    expect(list.body.items[0].id).toBe(me.body.client.id);

    const second = await registerVerifyLoginUser(ctx, email("classmate"), TEST_PASSWORD, {
      firstName: "Alex",
      lastName: "Lee",
    });
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", second.cookie)
      .send({ code })
      .expect(201);

    const afterSecond = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(afterSecond.body.items).toHaveLength(2);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", session.cookie)
      .send({ code, firstName: "Sam", lastName: "Taylor" })
      .expect(409)
      .expect((res) => expect(res.body.message).toBe(JOIN_ALREADY_CONNECTED));
  });

  it("invalidates a practice code on regenerate and enforces the client limit at join", async () => {
    const owner = await registerVerifyLogin();
    const org = await createOrg(owner.cookie, "Limited Classroom");
    const firstCode = await generatePracticeJoinCode(ctx, owner.cookie, org.id);
    const nextCode = await generatePracticeJoinCode(ctx, owner.cookie, org.id);
    expect(nextCode.code).not.toBe(firstCode.code);

    const stale = await registerVerifyLoginUser(ctx, email("stale"));
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", stale.cookie)
      .send({ code: firstCode.code, firstName: "Old", lastName: "Code" })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe(JOIN_CODE_INVALID));

    const feature = await ctx.prisma.feature.findUniqueOrThrow({ where: { key: FEATURE_KEYS.CLIENT_LIMIT } });
    await ctx.prisma.featureOverride.create({
      data: {
        dietitianAccountId: org.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 1,
        reason: "test quota",
      },
    });

    const first = await registerVerifyLoginUser(ctx, email("one"));
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", first.cookie)
      .send({ code: nextCode.code, firstName: "One", lastName: "Seat" })
      .expect(201);

    const blocked = await registerVerifyLoginUser(ctx, email("two"));
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/join")
      .set("Cookie", blocked.cookie)
      .send({ code: nextCode.code, firstName: "Two", lastName: "Seat" })
      .expect(403)
      .expect((res) => expect(res.body.message).toBe(CLIENT_LIMIT_REACHED));
  });
});
