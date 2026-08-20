import { Injectable, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { SESSION_COOKIE_NAME } from "@nutrition-saas/config";
import type { Server, Socket } from "socket.io";
import { SessionService } from "../auth/session.service";
import { ClientAccessService } from "../clients/client-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH_MESSAGES } from "../auth/auth.messages";
import { CLIENT_ACCESS_DENIED } from "../clients/client.messages";
import { ConversationService } from "./conversation.service";
import {
  REALTIME_NAMESPACE,
  conversationRoom,
  MessagingRealtimeService,
  userRoom,
} from "./messaging-realtime.service";

type SocketAuth = {
  userId: string;
  sessionId: string;
  activeClientId: string | null;
  conversationId: string | null;
  clientId: string | null;
};

function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rest.join("=") || "");
    }
  }
  return null;
}

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: { origin: true, credentials: true },
})
@Injectable()
export class MessagingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MessagingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessions: SessionService,
    private readonly access: ClientAccessService,
    private readonly conversations: ConversationService,
    private readonly realtime: MessagingRealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.setServer(server);
    // Authenticate in middleware so subscribe cannot race ahead of handleConnection.
    server.use(async (socket, next) => {
      try {
        const rawToken = parseCookieHeader(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
        if (!rawToken) {
          next(new Error(AUTH_MESSAGES.authenticationRequired));
          return;
        }
        const session = await this.sessions.validate(rawToken, {
          ipAddress: typeof socket.handshake.address === "string" ? socket.handshake.address : undefined,
          userAgent: socket.handshake.headers["user-agent"],
        });
        if (!session) {
          next(new Error(AUTH_MESSAGES.authenticationRequired));
          return;
        }
        const auth: SocketAuth = {
          userId: session.userId,
          sessionId: session.id,
          activeClientId: session.activeClientId ?? null,
          conversationId: null,
          clientId: null,
        };
        socket.data.auth = auth;
        next();
      } catch (err) {
        this.logger.warn(`WS handshake rejected: ${err instanceof Error ? err.message : String(err)}`);
        next(new Error(AUTH_MESSAGES.authenticationRequired));
      }
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const auth = socket.data.auth as SocketAuth | undefined;
    if (!auth) {
      socket.disconnect(true);
      return;
    }
    await socket.join(userRoom(auth.userId));
  }

  handleDisconnect(socket: Socket): void {
    void socket;
  }

  @SubscribeMessage("conversation.subscribe")
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { clientId?: string; conversationId?: string; dietitianAccountId?: string },
  ) {
    const auth = socket.data.auth as SocketAuth | undefined;
    if (!auth) {
      return { ok: false, error: AUTH_MESSAGES.authenticationRequired };
    }

    // Never trust conversationId / dietitianAccountId from the browser as authority.
    const requestedClientId = typeof body?.clientId === "string" ? body.clientId : null;
    if (!requestedClientId) {
      return { ok: false, error: CLIENT_ACCESS_DENIED };
    }

    try {
      const rawToken = parseCookieHeader(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
      if (rawToken) {
        const refreshed = await this.sessions.validate(rawToken);
        if (refreshed) {
          auth.activeClientId = refreshed.activeClientId ?? null;
        }
      }

      const resolved = await this.authorizeClient(auth, requestedClientId);
      const conversation = await this.conversations.getOrCreate(resolved.client);

      if (auth.conversationId && auth.conversationId !== conversation.id) {
        await socket.leave(conversationRoom(auth.conversationId));
      }

      auth.conversationId = conversation.id;
      auth.clientId = resolved.client.id;

      await socket.join(conversationRoom(conversation.id));
      return {
        ok: true,
        conversationId: conversation.id,
        clientId: resolved.client.id,
      };
    } catch {
      return { ok: false, error: CLIENT_ACCESS_DENIED };
    }
  }

  @SubscribeMessage("conversation.unsubscribe")
  async unsubscribe(@ConnectedSocket() socket: Socket) {
    const auth = socket.data.auth as SocketAuth | undefined;
    if (!auth?.conversationId) {
      return { ok: true };
    }
    await socket.leave(conversationRoom(auth.conversationId));
    auth.conversationId = null;
    auth.clientId = null;
    return { ok: true };
  }

  private async authorizeClient(auth: SocketAuth, clientId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { userId: auth.userId },
      select: { id: true, displayName: true, status: true },
    });

    if (account && account.status === "ACTIVE") {
      const client = await this.access.assertCanAccess(
        {
          userId: auth.userId,
          dietitianAccountId: account.id,
          displayName: account.displayName,
          accountStatus: account.status,
        },
        clientId,
        "read",
      );
      return { role: "dietitian" as const, client };
    }

    // Patient: only the session activeClientId (or matching ACTIVE ClientAccount).
    if (auth.activeClientId && auth.activeClientId !== clientId) {
      throw new Error("active_client_mismatch");
    }
    const client = await this.access.assertPortalAccess(auth.userId, {
      activeClientId: auth.activeClientId ?? clientId,
      clientId,
    });
    if (client.id !== clientId) {
      throw new Error("portal_client_mismatch");
    }
    return { role: "patient" as const, client };
  }
}
