import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { randomBytes } from "node:crypto";
import { InvitationService } from "../auth/invitation.service";
import { PasswordService } from "../auth/password.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { EmailService } from "../email/email.service";
import { OrganizationService } from "../organizations/organization.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";
import { AdminSubscriptionService } from "./admin-subscription.service";
import type { ProvisionDietitianDto } from "./dto/admin.dto";

@Injectable()
export class AdminDietitianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly organizations: OrganizationService,
    private readonly subscriptions: AdminSubscriptionService,
    private readonly invitations: InvitationService,
    private readonly email: EmailService,
    private readonly security: SecurityEventLogger,
  ) {}

  async provision(input: ProvisionDietitianDto, actor: AdminActor) {
    const emailNormalized = normalizeEmail(input.email);
    const displayName = (input.displayName ?? input.name ?? "").trim();
    if (!displayName) {
      throw new BadRequestException("displayName or name is required");
    }

    const existing = await this.prisma.user.findUnique({ where: { emailNormalized } });
    if (existing) {
      throw new ConflictException(ADMIN_MESSAGES.userAlreadyExists);
    }

    const placeholderPassword = `Tmp1${randomBytes(24).toString("base64url")}`;
    const passwordHash = await this.passwords.hash(placeholderPassword);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.trim(),
        emailNormalized,
        passwordHash,
        status: "PENDING",
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
      },
    });

    const account = await this.organizations.create(user.id, {
      name: displayName,
      settings: {
        timezone: "UTC",
        locale: "en",
        currency: "USD",
        weightUnit: "kg",
        heightUnit: "cm",
        dateFormat: "YYYY_MM_DD",
      },
    });
    if (!account) {
      throw new BadRequestException("Failed to create dietitian account");
    }

    let subscription = null;
    if (input.planId) {
      subscription = await this.subscriptions.assign(account.id, input.planId, actor, "ACTIVE");
    }

    const { rawToken } = await this.invitations.create({
      purpose: "DIETITIAN_ACTIVATION",
      emailNormalized,
      createdById: actor.userId,
      dietitianAccountId: account.id,
      organizationId: account.id,
    });
    await this.email.sendDietitianActivation(user.email, rawToken);

    await this.security.record({
      type: "dietitian_provisioned",
      outcome: "success",
      userId: actor.userId,
      organizationId: account.id,
      dietitianAccountId: account.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "user",
      targetId: user.id,
      metadata: { emailNormalized, planId: input.planId ?? null },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      dietitianAccount: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        status: account.status,
      },
      subscription,
      invitationSent: true,
    };
  }
}
