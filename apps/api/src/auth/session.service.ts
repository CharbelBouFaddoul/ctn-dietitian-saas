import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Session, User } from "@prisma/client";
import type { AppEnv } from "@nutrition-saas/validation";
import { PrismaService } from "../prisma/prisma.service";
import { CLIENT_ACCESS_DENIED, CLIENT_NOT_AVAILABLE } from "../clients/client.messages";
import { loadPlatformFlags } from "../platform-settings/platform-flags";
import type { AuthenticatedRequestUser, AuthenticatedSession, RequestMeta } from "./auth.types";
import { TokenService } from "./token.service";

export type SessionWithUser = Session & { user: User };

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async create(userId: string, meta: RequestMeta = {}): Promise<{ rawToken: string; session: Session }> {
    const { rawToken, tokenHash } = this.tokens.issue();
    const ttlSeconds = this.config.get("SESSION_TTL_SECONDS", { infer: true });
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    return { rawToken, session };
  }

  async validate(rawToken: string, meta: RequestMeta = {}): Promise<SessionWithUser | null> {
    const tokenHash = this.tokens.hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const flags = await loadPlatformFlags(this.prisma);
    if (
      session.user.status !== "ACTIVE" ||
      (flags.emailVerificationRequired && !session.user.emailVerifiedAt)
    ) {
      await this.revoke(session.id);
      return null;
    }

    if (!(await this.clientPortalMayAuthenticate(session.userId))) {
      await this.revoke(session.id);
      return null;
    }

    let activeClientId = session.activeClientId;
    if (activeClientId) {
      const account = await this.prisma.clientAccount.findFirst({
        where: { userId: session.userId, clientId: activeClientId, status: "ACTIVE" },
        include: { client: true },
      });
      if (!account || account.client.status !== "ACTIVE") {
        await this.clearActiveClientId(session.id);
        activeClientId = null;
      }
    }

    const now = new Date();
    const updated = await this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: now,
        ipAddress: meta.ipAddress ?? session.ipAddress,
        userAgent: meta.userAgent ?? session.userAgent,
      },
      include: { user: true },
    });

    return { ...updated, activeClientId };
  }

  async setActiveClientId(sessionId: string, userId: string, clientId: string): Promise<void> {
    const account = await this.prisma.clientAccount.findFirst({
      where: { userId, clientId, status: "ACTIVE" },
      include: { client: true },
    });
    if (!account) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    if (account.client.status !== "ACTIVE") {
      throw new ForbiddenException(CLIENT_NOT_AVAILABLE);
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeClientId: clientId },
    });
  }

  async clearActiveClientId(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeClientId: null },
    });
  }

  /**
   * After a ClientAccount is deactivated: keep sessions alive, but move
   * `activeClientId` off the deactivated client onto another ACTIVE connection
   * when one exists (otherwise null → patient stays logged in on /client/join).
   */
  async reassignActiveClientAfterDeactivate(
    userId: string,
    deactivatedClientId: string,
  ): Promise<void> {
    const remaining = await this.prisma.clientAccount.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        clientId: { not: deactivatedClientId },
      },
      include: { client: true },
      orderBy: { activatedAt: "asc" },
    });
    const nextClientId =
      remaining && remaining.client.status === "ACTIVE" ? remaining.clientId : null;

    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, activeClientId: deactivatedClientId },
      data: { activeClientId: nextClientId },
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByRawToken(rawToken: string): Promise<string | null> {
    const tokenHash = this.tokens.hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!session || session.revokedAt) {
      return null;
    }
    await this.revoke(session.id);
    return session.userId;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeOtherSessions(userId: string, exceptSessionId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: exceptSessionId } },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  toAuthenticatedUser(user: User): AuthenticatedRequestUser {
    return {
      id: user.id,
      email: user.email,
      emailNormalized: user.emailNormalized,
      status: user.status,
      platformRole: user.platformRole,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async clientPortalMayAuthenticate(userId: string): Promise<boolean> {
    const accounts = await this.prisma.clientAccount.findMany({
      where: { userId },
      include: { client: true },
    });
    if (accounts.length === 0) {
      return true;
    }
    const dietitianAccount = await this.prisma.dietitianAccount.findUnique({
      where: { userId },
    });
    if (dietitianAccount) {
      return true;
    }
    return accounts.some(
      (account) =>
        account.client.status === "ACTIVE" &&
        (account.status === "ACTIVE" || account.status === "DEACTIVATED"),
    );
  }

  toAuthenticatedSession(session: Session): AuthenticatedSession {
    return {
      id: session.id,
      userId: session.userId,
      activeClientId: session.activeClientId ?? null,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
    };
  }
}
