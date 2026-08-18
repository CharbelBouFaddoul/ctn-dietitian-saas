import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH_MESSAGES } from "./auth.messages";
import { PasswordService } from "./password.service";
import { SecurityEventLogger } from "./security-event.logger";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly security: SecurityEventLogger,
  ) {}

  async forgot(emailNormalized: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
    });

    if (
      user &&
      user.status !== "SUSPENDED" &&
      user.status !== "ARCHIVED"
    ) {
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const { rawToken, tokenHash } = this.tokens.issue();
      const ttl = this.config.get("PASSWORD_RESET_TTL_SECONDS", { infer: true });
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      });
      await this.email.sendPasswordReset(user.email, rawToken);
      await this.security.record({
        type: "password_reset_requested",
        outcome: "success",
        userId: user.id,
        emailNormalized,
      });
      return;
    }

    await this.security.record({
      type: "password_reset_requested",
      outcome: "success",
      emailNormalized,
      reason: "no_email_sent",
    });
  }

  async reset(rawToken: string, password: string): Promise<void> {
    this.passwords.assertPolicy(password);

    const tokenHash = this.tokens.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      await this.security.record({
        type: "password_reset",
        outcome: "failure",
        reason: "invalid_or_expired_token",
      });
      throw new BadRequestException(AUTH_MESSAGES.invalidResetToken);
    }

    const passwordHash = await this.passwords.hash(password);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
    ]);

    await this.sessions.revokeAllForUser(record.userId);

    await this.security.record({
      type: "password_reset",
      outcome: "success",
      userId: record.userId,
      emailNormalized: record.user.emailNormalized,
    });
  }
}
