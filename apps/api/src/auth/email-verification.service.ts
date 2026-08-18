import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH_MESSAGES } from "./auth.messages";
import { SecurityEventLogger } from "./security-event.logger";
import { TokenService } from "./token.service";

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly security: SecurityEventLogger,
  ) {}

  async issueAndSend(userId: string, email: string): Promise<string> {
    const rawToken = await this.issue(userId);
    await this.email.sendVerification(email, rawToken);
    return rawToken;
  }

  async issue(userId: string): Promise<string> {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { rawToken, tokenHash } = this.tokens.issue();
    const ttl = this.config.get("EMAIL_VERIFICATION_TTL_SECONDS", { infer: true });
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return rawToken;
  }

  async verify(rawToken: string): Promise<void> {
    const tokenHash = this.tokens.hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      await this.security.record({
        type: "email_verification",
        outcome: "failure",
        reason: "invalid_or_expired_token",
      });
      throw new BadRequestException(AUTH_MESSAGES.invalidVerificationToken);
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          emailVerifiedAt: record.user.emailVerifiedAt ?? now,
          status: record.user.status === "PENDING" ? "ACTIVE" : record.user.status,
        },
      }),
    ]);

    await this.security.record({
      type: "email_verification",
      outcome: "success",
      userId: record.userId,
      emailNormalized: record.user.emailNormalized,
    });
  }

  async resend(emailNormalized: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });

    if (user && !user.emailVerifiedAt && user.status !== "ARCHIVED") {
      await this.issueAndSend(user.id, user.email);
      await this.security.record({
        type: "email_verification_resend",
        outcome: "success",
        userId: user.id,
        emailNormalized,
      });
      return;
    }

    await this.security.record({
      type: "email_verification_resend",
      outcome: "success",
      emailNormalized,
      reason: "no_email_sent",
    });
  }
}
