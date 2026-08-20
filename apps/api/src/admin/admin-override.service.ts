import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";
import type { UpsertFeatureOverrideDto } from "./dto/admin.dto";

/** Admin APIs: dietitianAccountId argument is DietitianAccount.id */
@Injectable()
export class AdminOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  async upsert(dietitianAccountId: string, featureKey: string, input: UpsertFeatureOverrideDto, actor: AdminActor) {
    const account = await this.prisma.dietitianAccount.findUnique({ where: { id: dietitianAccountId } });
    if (!account) {
      throw new NotFoundException(ADMIN_MESSAGES.dietitianAccountNotFound);
    }

    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) {
      throw new NotFoundException(ADMIN_MESSAGES.featureNotFound);
    }

    if (input.enabled === undefined && input.limitValue === undefined) {
      throw new BadRequestException(ADMIN_MESSAGES.invalidOverride);
    }

    const override = await this.prisma.featureOverride.upsert({
      where: {
        dietitianAccountId_featureId: { dietitianAccountId, featureId: feature.id },
      },
      create: {
        dietitianAccountId,
        featureId: feature.id,
        enabled: input.enabled ?? null,
        limitValue: input.limitValue ?? null,
        reason: input.reason,
        createdById: actor.userId,
      },
      update: {
        enabled: input.enabled === undefined ? undefined : input.enabled,
        limitValue: input.limitValue === undefined ? undefined : input.limitValue,
        reason: input.reason,
      },
    });

    await this.security.record({
      type: "feature_override_upserted",
      outcome: "success",
      userId: actor.userId,
      dietitianAccountId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "feature_override",
      targetId: override.id,
      metadata: {
        featureKey,
        enabled: override.enabled,
        limitValue: override.limitValue,
        reason: input.reason,
      },
    });

    return {
      id: override.id,
      featureKey,
      enabled: override.enabled,
      limitValue: override.limitValue,
      reason: override.reason,
    };
  }

  async remove(dietitianAccountId: string, featureKey: string, actor: AdminActor) {
    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) {
      throw new NotFoundException(ADMIN_MESSAGES.featureNotFound);
    }

    const existing = await this.prisma.featureOverride.findUnique({
      where: {
        dietitianAccountId_featureId: { dietitianAccountId, featureId: feature.id },
      },
    });
    if (!existing) {
      return { removed: false };
    }

    await this.prisma.featureOverride.delete({ where: { id: existing.id } });
    await this.security.record({
      type: "feature_override_removed",
      outcome: "success",
      userId: actor.userId,
      dietitianAccountId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "feature_override",
      targetId: existing.id,
      metadata: { featureKey },
    });
    return { removed: true };
  }
}
