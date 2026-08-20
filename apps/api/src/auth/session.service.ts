import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Session, User } from "@prisma/client";
import type { AppEnv } from "@nutrition-saas/validation";
import { PrismaService } from "../prisma/prisma.service";
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

    if (session.user.status !== "ACTIVE" || !session.user.emailVerifiedAt) {
      await this.revoke(session.id);
      return null;
    }

    if (!(await this.clientPortalMayAuthenticate(session.userId))) {
      await this.revoke(session.id);
      return null;
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

    return updated;
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

  toAuthenticatedUser(user: User): AuthenticatedRequestUser {
    return {
      id: user.id,
      email: user.email,
      emailNormalized: user.emailNormalized,
      status: user.status,
      platformRole: user.platformRole,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }

  async clientPortalMayAuthenticate(userId: string): Promise<boolean> {
    const account = await this.prisma.clientAccount.findUnique({
      where: { userId },
      include: { client: true },
    });
    if (!account) {
      return true;
    }
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (membership) {
      return true;
    }
    if (account.client.status !== "ACTIVE") {
      return false;
    }
    return account.status === "ACTIVE" || account.status === "DEACTIVATED";
  }

  toAuthenticatedSession(session: Session): AuthenticatedSession {
    return {
      id: session.id,
      userId: session.userId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
    };
  }
}
