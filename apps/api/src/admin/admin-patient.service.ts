import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FEATURE_KEYS, INTERNAL_UNITS } from "@nutrition-saas/config";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { randomBytes } from "node:crypto";
import { InvitationService } from "../auth/invitation.service";
import { PasswordService } from "../auth/password.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { CLIENT_LIMIT_REACHED } from "../clients/client.messages";
import { DietitianLifecycleService } from "../dietitian/dietitian-lifecycle.service";
import { EmailService } from "../email/email.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";
import type { ProvisionPatientDto } from "./dto/admin.dto";

@Injectable()
export class AdminPatientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: DietitianLifecycleService,
    private readonly entitlements: EntitlementService,
    private readonly passwords: PasswordService,
    private readonly invitations: InvitationService,
    private readonly email: EmailService,
    private readonly security: SecurityEventLogger,
  ) {}

  async provision(input: ProvisionPatientDto, actor: AdminActor) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: input.dietitianAccountId },
    });
    if (!account) {
      throw new NotFoundException(ADMIN_MESSAGES.dietitianAccountNotFound);
    }
    this.lifecycle.assertOperable(account.status);

    const emailRaw = input.email?.trim() || null;
    const emailNormalized = emailRaw ? normalizeEmail(emailRaw) : null;
    const inviteToPortal = input.inviteToPortal ?? Boolean(emailNormalized);

    if (inviteToPortal && !emailNormalized) {
      throw new BadRequestException(ADMIN_MESSAGES.inviteRequiresEmail);
    }

    if (inviteToPortal && emailNormalized) {
      const existingUser = await this.prisma.user.findUnique({ where: { emailNormalized } });
      if (existingUser) {
        throw new ConflictException(ADMIN_MESSAGES.userAlreadyExists);
      }
    }

    await this.assertClientLimit(account.id);

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          dietitianAccountId: account.id,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          email: emailRaw,
          phone: input.phone?.trim() || null,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          sex: input.sex ?? null,
          status: "ACTIVE",
          createdById: actor.userId,
        },
      });

      await tx.clientProfile.create({
        data: {
          dietitianAccountId: account.id,
          clientId: client.id,
          lifestyle: input.activityLevel?.trim() || null,
        },
      });

      const measurements: Array<{ id: string; type: "HEIGHT" | "WEIGHT" }> = [];
      if (input.heightCm !== undefined) {
        const row = await tx.clientMeasurement.create({
          data: {
            dietitianAccountId: account.id,
            clientId: client.id,
            type: "HEIGHT",
            value: input.heightCm,
            unit: INTERNAL_UNITS.height,
            measuredAt: now,
            recordedById: actor.userId,
          },
        });
        measurements.push({ id: row.id, type: "HEIGHT" });
      }
      if (input.weightKg !== undefined) {
        const row = await tx.clientMeasurement.create({
          data: {
            dietitianAccountId: account.id,
            clientId: client.id,
            type: "WEIGHT",
            value: input.weightKg,
            unit: INTERNAL_UNITS.weight,
            measuredAt: now,
            recordedById: actor.userId,
          },
        });
        measurements.push({ id: row.id, type: "WEIGHT" });
      }

      let portalUser: { id: string; email: string; status: string } | null = null;
      let portalAccount: { id: string; status: string } | null = null;

      if (inviteToPortal && emailNormalized && emailRaw) {
        const placeholderPassword = `Tmp1${randomBytes(24).toString("base64url")}`;
        const passwordHash = await this.passwords.hash(placeholderPassword);
        const user = await tx.user.create({
          data: {
            email: emailRaw,
            emailNormalized,
            passwordHash,
            status: "PENDING",
            firstName,
            lastName,
          },
        });
        const clientAccount = await tx.clientAccount.create({
          data: {
            userId: user.id,
            clientId: client.id,
            dietitianAccountId: account.id,
            status: "PENDING",
          },
        });
        portalUser = { id: user.id, email: user.email, status: user.status };
        portalAccount = { id: clientAccount.id, status: clientAccount.status };
      }

      return { client, measurements, portalUser, portalAccount };
    });

    let invitationSent = false;
    if (inviteToPortal && emailNormalized && result.portalUser) {
      const { rawToken } = await this.invitations.create({
        purpose: "CLIENT_INVITE",
        emailNormalized,
        createdById: actor.userId,
        clientId: result.client.id,
        dietitianAccountId: account.id,
      });
      await this.email.sendClientActivation(result.portalUser.email, rawToken);
      invitationSent = true;
    }

    await this.security.record({
      type: "patient_provisioned",
      outcome: "success",
      userId: actor.userId,
      dietitianAccountId: account.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "client",
      targetId: result.client.id,
      metadata: {
        inviteToPortal,
        invitationSent,
        measurementTypes: result.measurements.map((row) => row.type),
      },
    });

    return {
      client: {
        id: result.client.id,
        firstName: result.client.firstName,
        lastName: result.client.lastName,
        email: result.client.email,
        phone: result.client.phone,
        status: result.client.status,
        dietitianAccountId: account.id,
      },
      measurements: result.measurements,
      portalUser: result.portalUser,
      portalAccount: result.portalAccount,
      invitationSent,
    };
  }

  private async assertClientLimit(dietitianAccountId: string): Promise<void> {
    const entitlement = await this.entitlements.resolve(dietitianAccountId, FEATURE_KEYS.CLIENT_LIMIT);
    if (!entitlement.enabled) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
    if (entitlement.limit === null) {
      return;
    }
    const count = await this.prisma.client.count({
      where: { dietitianAccountId, status: { in: ["PENDING", "ACTIVE"] } },
    });
    if (count >= entitlement.limit) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
  }
}
