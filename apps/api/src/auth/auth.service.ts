import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH_MESSAGES } from "./auth.messages";
import type { RequestMeta } from "./auth.types";
import { ConsentService } from "./consent.service";
import { EmailVerificationService } from "./email-verification.service";
import { PasswordService } from "./password.service";
import { SecurityEventLogger } from "./security-event.logger";
import { SessionService } from "./session.service";

export interface RegisterInput {
  email: string;
  password: string;
  consents?: Array<{ type: "TERMS_OF_SERVICE" | "PRIVACY_POLICY"; policyVersion: string }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly verification: EmailVerificationService,
    private readonly consents: ConsentService,
    private readonly security: SecurityEventLogger,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta = {}): Promise<void> {
    this.passwords.assertPolicy(input.password);
    const emailNormalized = normalizeEmail(input.email);
    const passwordHash = await this.passwords.hash(input.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email.trim(),
          emailNormalized,
          passwordHash,
          status: "PENDING",
        },
      });

      if (input.consents) {
        for (const consent of input.consents) {
          await this.consents.record({
            userId: user.id,
            type: consent.type,
            policyVersion: consent.policyVersion,
            ipAddress: meta.ipAddress,
          });
        }
      }

      await this.verification.issueAndSend(user.id, user.email);
      await this.security.record({
        type: "register",
        outcome: "success",
        userId: user.id,
        emailNormalized,
        ipAddress: meta.ipAddress,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.user.findUnique({
          where: { emailNormalized },
        });
        if (existing && !existing.emailVerifiedAt && existing.status === "PENDING") {
          await this.verification.issueAndSend(existing.id, existing.email);
        }
        await this.security.record({
          type: "register",
          outcome: "success",
          emailNormalized,
          ipAddress: meta.ipAddress,
          reason: "email_already_registered",
        });
        return;
      }
      throw error;
    }
  }

  async login(
    email: string,
    password: string,
    meta: RequestMeta = {},
  ): Promise<{ rawToken: string }> {
    const emailNormalized = normalizeEmail(email);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });

    const passwordOk = await this.passwords.verify(password, user?.passwordHash ?? null);
    const portalOk = user ? await this.sessions.clientPortalMayAuthenticate(user.id) : true;
    const canAuthenticate =
      !!user &&
      passwordOk &&
      user.status === "ACTIVE" &&
      user.emailVerifiedAt !== null &&
      portalOk;

    if (!canAuthenticate) {
      await this.security.record({
        type: "login",
        outcome: "failure",
        emailNormalized,
        ipAddress: meta.ipAddress,
        reason: this.loginFailureReason(user, passwordOk),
      });
      throw new UnauthorizedException(AUTH_MESSAGES.invalidCredentials);
    }

    const { rawToken } = await this.sessions.create(user.id, meta);
    await this.security.record({
      type: "login",
      outcome: "success",
      userId: user.id,
      emailNormalized,
      ipAddress: meta.ipAddress,
    });
    return { rawToken };
  }

  async logout(
    sessionId: string | undefined,
    userId: string,
    meta: RequestMeta = {},
    revoke = true,
  ): Promise<void> {
    if (revoke && sessionId) {
      await this.sessions.revoke(sessionId);
    }
    await this.security.record({
      type: "logout",
      outcome: "success",
      userId,
      ipAddress: meta.ipAddress,
    });
  }

  async revokeAllSessions(userId: string, meta: RequestMeta = {}): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
    await this.security.record({
      type: "session_revocation",
      outcome: "success",
      userId,
      ipAddress: meta.ipAddress,
      reason: "revoke_all",
    });
  }

  private loginFailureReason(
    user: { status: string; emailVerifiedAt: Date | null } | null,
    passwordOk: boolean,
  ): string {
    if (!user) {
      return "unknown_user";
    }
    if (!passwordOk) {
      return "invalid_password";
    }
    if (user.status === "SUSPENDED") {
      return "suspended";
    }
    if (user.status === "ARCHIVED") {
      return "archived";
    }
    if (user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      return "not_active";
    }
    return "portal_inactive";
  }
}
