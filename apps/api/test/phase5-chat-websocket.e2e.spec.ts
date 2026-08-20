import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { SESSION_COOKIE_NAME } from "@nutrition-saas/config";
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

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectSocket(port: number, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}/realtime`, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      autoConnect: true,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connect timeout"));
    }, 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function subscribeClient(
  socket: Socket,
  payload: { clientId: string; conversationId?: string; dietitianAccountId?: string },
) {
  return await new Promise<{ ok: boolean; conversationId?: string; clientId?: string; error?: string }>(
    (resolve, reject) => {
      socket.timeout(5000).emit("conversation.subscribe", payload, (err: Error | null, response: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((response ?? { ok: false }) as { ok: boolean; conversationId?: string; clientId?: string; error?: string });
      });
    },
  );
}

describe("phase5 chat + websockets", () => {
  let ctx: AuthTestContext;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createAuthTestApp({ realtime: true });
  });

  beforeEach(async () => {
    ctx.emails.messages.length = 0;
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
    await ctx?.realtimeAdapter?.shutdownRedisClients();
  });

  function email(prefix = "p5ws"): string {
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
    const raw = cookieValue(login.headers["set-cookie"]);
    return { address, cookie: `${SESSION_COOKIE_NAME}=${raw}`, id: raw };
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

  it("keeps REST messaging and notifies once; peer receives realtime message.created", async () => {
    expect(ctx.port).toBeTruthy();
    const owner = await registerVerifyLogin(email("own"));
    const org = await createOrg(owner.cookie, "WS Practice");
    const client = await createClient(owner.cookie, org.id);
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client);

    const patientSocket = await connectSocket(ctx.port!, portalCookie);
    const sub = await subscribeClient(patientSocket, { clientId: client.id });
    expect(sub.ok).toBe(true);

    const pending = waitForEvent<{
      messageId: string;
      conversationId: string;
      clientId: string;
      body: string;
    }>(patientSocket, "message.created");

    const sent = await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/conversation/messages`)
      .set("Cookie", owner.cookie)
      .send({ body: "Hello from dietitian" })
      .expect(201);

    const event = await pending;
    expect(event.messageId).toBe(sent.body.id);
    expect(event.conversationId).toBe(sent.body.conversationId);
    expect(event.clientId).toBe(client.id);
    expect(event.body).toBe("Hello from dietitian");

    const dietitianSocket = await connectSocket(ctx.port!, owner.cookie);
    expect((await subscribeClient(dietitianSocket, { clientId: client.id })).ok).toBe(true);
    const replyWait = waitForEvent<{ messageId: string; body: string }>(dietitianSocket, "message.created");

    const reply = await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/conversation/messages")
      .set("Cookie", portalCookie)
      .send({ body: "Hello back" })
      .expect(201);

    const replyEvent = await replyWait;
    expect(replyEvent.messageId).toBe(reply.body.id);
    expect(replyEvent.body).toBe("Hello back");

    const messageCount = await ctx.prisma.message.count({
      where: { clientId: client.id },
    });
    expect(messageCount).toBe(2);

    const notifs = await ctx.prisma.notification.count({
      where: { clientId: client.id, type: "NEW_MESSAGE" },
    });
    expect(notifs).toBe(2);

    patientSocket.disconnect();
    dietitianSocket.disconnect();
  });

  it("rejects unauthenticated sockets and cross-tenant subscribe attempts", async () => {
    const a = await registerVerifyLogin(email("da"));
    const b = await registerVerifyLogin(email("db"));
    const orgA = await createOrg(a.cookie, "Practice A");
    const orgB = await createOrg(b.cookie, "Practice B");
    const clientA = await createClient(a.cookie, orgA.id);
    const clientB = await createClient(b.cookie, orgB.id);

    const anon = io(`http://127.0.0.1:${ctx.port}/realtime`, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("anon socket still open")), 5000);
      anon.on("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
      anon.on("connect_error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    expect(anon.connected).toBe(false);
    anon.disconnect();

    const socketA = await connectSocket(ctx.port!, a.cookie);
    const denied = await subscribeClient(socketA, { clientId: clientB.id });
    expect(denied.ok).toBe(false);

    const deniedConv = await subscribeClient(socketA, {
      clientId: clientA.id,
      conversationId: "00000000-0000-0000-0000-000000000099",
      dietitianAccountId: orgB.id,
    });
    // Still ok because server ignores foreign conversationId and uses clientId of A.
    expect(deniedConv.ok).toBe(true);
    expect(deniedConv.clientId).toBe(clientA.id);

    socketA.disconnect();
  });

  it("scopes patient realtime events to activeClientId across dual connections", async () => {
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

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientA.id })
      .expect(200);

    const patientSocket = await connectSocket(ctx.port!, portalCookie);
    expect((await subscribeClient(patientSocket, { clientId: clientA.id })).ok).toBe(true);
    expect((await subscribeClient(patientSocket, { clientId: clientB.id })).ok).toBe(false);

    const leak = waitForEvent(patientSocket, "message.created", 1500).then(
      () => true,
      () => false,
    );

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/conversation/messages`)
      .set("Cookie", ownerB.cookie)
      .send({ body: "Secret for B only" })
      .expect(201);

    expect(await leak).toBe(false);

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/connections/active")
      .set("Cookie", portalCookie)
      .send({ clientId: clientB.id })
      .expect(200);

    // Reconnect so handshake picks up updated activeClientId from session cookie validation path.
    patientSocket.disconnect();
    const patientB = await connectSocket(ctx.port!, portalCookie);
    expect((await subscribeClient(patientB, { clientId: clientB.id })).ok).toBe(true);
    expect((await subscribeClient(patientB, { clientId: clientA.id })).ok).toBe(false);

    const pending = waitForEvent<{ body: string }>(patientB, "message.created");
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${orgB.id}/clients/${clientB.id}/conversation/messages`)
      .set("Cookie", ownerB.cookie)
      .send({ body: "Visible on B" })
      .expect(201);
    expect((await pending).body).toBe("Visible on B");

    patientB.disconnect();
  });

  it("emits message.read / unread updates and still works when socket disconnects", async () => {
    const owner = await registerVerifyLogin(email("rd"));
    const org = await createOrg(owner.cookie, "Read Practice");
    const client = await createClient(owner.cookie, org.id);
    const portalCookie = await connectClientPortal(ctx, owner.cookie, org.id, client);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/dietitian/${org.id}/clients/${client.id}/conversation/messages`)
      .set("Cookie", owner.cookie)
      .send({ body: "Please read me" })
      .expect(201);

    const dietitianSocket = await connectSocket(ctx.port!, owner.cookie);
    expect((await subscribeClient(dietitianSocket, { clientId: client.id })).ok).toBe(true);
    const readWait = waitForEvent<{ readerUserId: string; conversationId: string }>(
      dietitianSocket,
      "message.read",
    );

    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/conversation/read")
      .set("Cookie", portalCookie)
      .send({})
      .expect((res) => expect([200, 201]).toContain(res.status));

    const readEvent = await readWait;
    expect(readEvent.conversationId).toBeTruthy();

    dietitianSocket.disconnect();

    // REST still works without socket.
    await request(ctx.app.getHttpServer())
      .post("/api/v1/portal/conversation/messages")
      .set("Cookie", portalCookie)
      .send({ body: "Still works offline" })
      .expect(201);

    const reconnected = await connectSocket(ctx.port!, owner.cookie);
    expect((await subscribeClient(reconnected, { clientId: client.id })).ok).toBe(true);
    const messages = await request(ctx.app.getHttpServer())
      .get(`/api/v1/dietitian/${org.id}/clients/${client.id}/conversation/messages`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(messages.body.some((row: { body: string }) => row.body === "Still works offline")).toBe(true);
    reconnected.disconnect();
  });
});
