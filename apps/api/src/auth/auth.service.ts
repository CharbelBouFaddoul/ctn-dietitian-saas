import { BadRequestException, Inject, Injectable, UnauthorizedException, forwardRef } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { assertRegistrationEnabled } from "../platform-settings/registration-gate";
import { loadPlatformFlags } from "../platform-settings/platform-flags";
import { DietitianService } from "../dietitian/dietitian.service";
import { AUTH_MESSAGES } from "./auth.messages";
import type { RequestMeta } from "./auth.types";
import { ConsentService } from "./consent.service";
import { EmailVerificationService } from "./email-verification.service";
import { InvitationService, InvalidInvitationTokenError } from "./invitation.service";
import { PasswordService } from "./password.service";
import { SecurityEventLogger } from "./security-event.logger";
import { SessionService } from "./session.service";

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  audience?: "dietitian" | "patient";
  clinicName?: string;
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
    private readonly invitations: InvitationService,
    private readonly security: SecurityEventLogger,
    @Inject(forwardRef(() => DietitianService))
    private readonly dietitians: DietitianService,
  ) {}

  async register(
    input: RegisterInput,
    meta: RequestMeta = {},
  ): Promise<{
    emailVerificationRequired: boolean;
    dietitianAccountId: string | null;
    rawToken?: string;
  }> {
    await assertRegistrationEnabled(this.prisma, input.audience ?? "dietitian");
    this.passwords.assertPolicy(input.password);
    const emailNormalized = normalizeEmail(input.email);
    const passwordHash = await this.passwords.hash(input.password);
    const flags = await loadPlatformFlags(this.prisma);
    const verify = flags.emailVerificationRequired;
    const audience = input.audience ?? "dietitian";
    const clinicName = input.clinicName?.trim();

    try {
      const now = new Date();
      const user = await this.prisma.user.create({
        data: {
          email: input.email.trim(),
          emailNormalized,
          passwordHash,
          status: verify ? "PENDING" : "ACTIVE",
          emailVerifiedAt: verify ? null : now,
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
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

      let dietitianAccountId: string | null = null;
      if (audience === "dietitian" && clinicName) {
        const created = await this.dietitians.create(user.id, {
          name: clinicName,
          settings: {
            timezone: "UTC",
            locale: "en",
            currency: "USD",
            weightUnit: "kg",
            heightUnit: "cm",
            dateFormat: "YYYY_MM_DD",
          },
        });
        dietitianAccountId = created?.id ?? null;
      }

      if (verify) {
        await this.verification.issueAndSend(user.id, user.email);
      }

      await this.security.record({
        type: "register",
        outcome: "success",
        userId: user.id,
        emailNormalized,
        ipAddress: meta.ipAddress,
      });

      if (!verify && user.status === "ACTIVE") {
        const { rawToken } = await this.sessions.create(user.id, meta);
        return { emailVerificationRequired: false, dietitianAccountId, rawToken };
      }

      return { emailVerificationRequired: verify, dietitianAccountId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.user.findUnique({
          where: { emailNormalized },
        });
        if (existing && !existing.emailVerifiedAt && existing.status === "PENDING" && verify) {
          await this.verification.issueAndSend(existing.id, existing.email);
        }
        await this.security.record({
          type: "register",
          outcome: "success",
          emailNormalized,
          ipAddress: meta.ipAddress,
          reason: "email_already_registered",
        });
        return { emailVerificationRequired: verify, dietitianAccountId: null };
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
    const flags = await loadPlatformFlags(this.prisma);
    const canAuthenticate =
      !!user &&
      passwordOk &&
      user.status === "ACTIVE" &&
      (!flags.emailVerificationRequired || user.emailVerifiedAt !== null) &&
      portalOk;

    if (!canAuthenticate) {
      await this.security.record({
        type: "login",
        outcome: "failure",
        emailNormalized,
        ipAddress: meta.ipAddress,
        reason: this.loginFailureReason(user, passwordOk, flags.emailVerificationRequired),
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

  async revokeOtherSessions(userId: string, sessionId: string, meta: RequestMeta = {}): Promise<void> {
    await this.sessions.revokeOtherSessions(userId, sessionId);
    await this.security.record({
      type: "session_revocation",
      outcome: "success",
      userId,
      ipAddress: meta.ipAddress,
      reason: "revoke_others",
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    this.passwords.assertPolicy(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.invalidCredentials);
    }
    const ok = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException(AUTH_MESSAGES.currentPasswordIncorrect);
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.security.record({
      type: "password_change",
      outcome: "success",
      userId,
    });
  }

  async changeEmail(userId: string, email: string, currentPassword: string): Promise<{ email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.invalidCredentials);
    }
    const ok = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException(AUTH_MESSAGES.currentPasswordIncorrect);
    }

    const nextEmail = email.trim();
    const emailNormalized = normalizeEmail(nextEmail);
    if (emailNormalized === user.emailNormalized) {
      return { email: user.email };
    }

    const existing = await this.prisma.user.findUnique({ where: { emailNormalized } });
    if (existing) {
      throw new BadRequestException(AUTH_MESSAGES.emailInUse);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: nextEmail, emailNormalized },
    });
    await this.security.record({
      type: "email_change",
      outcome: "success",
      userId,
      emailNormalized,
    });
    return { email: updated.email };
  }

  async acceptDietitianInvitation(
    rawToken: string,
    password: string,
    meta: RequestMeta = {},
  ): Promise<void> {
    this.passwords.assertPolicy(password);

    let invitation;
    try {
      invitation = await this.invitations.validate(rawToken);
    } catch (error) {
      if (error instanceof InvalidInvitationTokenError) {
        throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
      }
      throw error;
    }

    const activationPurposes = new Set(["DIETITIAN_ACTIVATION", "CLIENT_INVITE"]);
    if (!activationPurposes.has(invitation.purpose) || !invitation.emailNormalized) {
      throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
    }
    // Join-code CLIENT_INVITE rows have no emailNormalized and are accepted via /portal/join.
    if (invitation.purpose === "CLIENT_INVITE" && !invitation.clientId) {
      throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
    }

    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: invitation.emailNormalized },
    });
    if (!user || user.status === "SUSPENDED" || user.status === "ARCHIVED") {
      throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
    }

    const passwordHash = await this.passwords.hash(password);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: user.emailVerifiedAt ?? now,
      },
    });

    if (invitation.purpose === "CLIENT_INVITE") {
      await this.prisma.clientAccount.updateMany({
        where: { userId: user.id, status: "PENDING" },
        data: { status: "ACTIVE", activatedAt: now },
      });
    }

    await this.invitations.consume(rawToken, user.id);
    await this.sessions.revokeAllForUser(user.id);
    await this.security.record({
      type:
        invitation.purpose === "CLIENT_INVITE"
          ? "client_invitation_accepted"
          : "dietitian_invitation_accepted",
      outcome: "success",
      userId: user.id,
      emailNormalized: user.emailNormalized,
      ipAddress: meta.ipAddress,
    });
  }

  private loginFailureReason(
    user: { status: string; emailVerifiedAt: Date | null } | null,
    passwordOk: boolean,
    emailVerificationRequired: boolean,
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
    if (user.status !== "ACTIVE" || (emailVerificationRequired && !user.emailVerifiedAt)) {
      return "not_active";
    }
    return "portal_inactive";
  }
}
