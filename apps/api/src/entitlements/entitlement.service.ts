import { Injectable } from "@nestjs/common";
import type { EntitlementResult, EntitlementSource } from "@nutrition-saas/types";
import { PrismaService } from "../prisma/prisma.service";

const DENY: EntitlementResult = { enabled: false, limit: null, source: "default" };

export interface EffectiveFeatureEntitlement extends EntitlementResult {
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT";
  featureStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  planEnabled: boolean | null;
  planLimit: number | null;
  overrideEnabled: boolean | null;
  overrideLimit: number | null;
  overrideReason: string | null;
}

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Phase 1: organizationId argument is DietitianAccount.id */
  async can(dietitianAccountId: string, featureKey: string): Promise<boolean> {
    const result = await this.resolve(dietitianAccountId, featureKey);
    return result.enabled;
  }

  async limit(dietitianAccountId: string, featureKey: string): Promise<number | null> {
    const result = await this.resolve(dietitianAccountId, featureKey);
    return result.limit;
  }

  async resolve(dietitianAccountId: string, featureKey: string): Promise<EntitlementResult> {
    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature || feature.status !== "ACTIVE") {
      return DENY;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId },
    });
    if (!subscription || subscription.status !== "ACTIVE") {
      return DENY;
    }

    const [planFeature, override] = await Promise.all([
      this.prisma.planFeature.findUnique({
        where: {
          planId_featureId: { planId: subscription.planId, featureId: feature.id },
        },
      }),
      this.prisma.featureOverride.findUnique({
        where: {
          dietitianAccountId_featureId: { dietitianAccountId, featureId: feature.id },
        },
      }),
    ]);

    return this.combine(planFeature, override);
  }

  async listEffective(dietitianAccountId: string): Promise<EffectiveFeatureEntitlement[]> {
    const [features, subscription, overrides] = await Promise.all([
      this.prisma.feature.findMany({ orderBy: { key: "asc" } }),
      this.prisma.subscription.findUnique({
        where: { dietitianAccountId },
        include: { plan: { include: { planFeatures: true } } },
      }),
      this.prisma.featureOverride.findMany({ where: { dietitianAccountId } }),
    ]);

    const overrideByFeature = new Map(overrides.map((row) => [row.featureId, row]));
    const planFeatureByFeature = new Map(
      (subscription?.plan.planFeatures ?? []).map((row) => [row.featureId, row]),
    );

    return features.map((feature) => {
      const planFeature = planFeatureByFeature.get(feature.id) ?? null;
      const override = overrideByFeature.get(feature.id) ?? null;
      const resolved =
        feature.status === "ACTIVE" && subscription?.status === "ACTIVE"
          ? this.combine(planFeature, override)
          : DENY;

      return {
        key: feature.key,
        name: feature.name,
        valueType: feature.valueType,
        featureStatus: feature.status,
        enabled: resolved.enabled,
        limit: resolved.limit,
        source: resolved.source,
        planEnabled: planFeature?.enabled ?? null,
        planLimit: planFeature?.limitValue ?? null,
        overrideEnabled: override?.enabled ?? null,
        overrideLimit: override?.limitValue ?? null,
        overrideReason: override?.reason ?? null,
      };
    });
  }

  private combine(
    planFeature: { enabled: boolean; limitValue: number | null } | null,
    override: { enabled: boolean | null; limitValue: number | null } | null,
  ): EntitlementResult {
    const planEnabled = planFeature?.enabled ?? false;
    const planLimit = planFeature?.limitValue ?? null;

    if (override) {
      return {
        enabled: override.enabled ?? planEnabled,
        limit: override.limitValue ?? planLimit,
        source: "override",
      };
    }

    if (planFeature) {
      return {
        enabled: planEnabled,
        limit: planLimit,
        source: "plan",
      };
    }

    return DENY;
  }
}

export function publicEntitlement(row: EffectiveFeatureEntitlement): {
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT";
  enabled: boolean;
  limit: number | null;
  source: EntitlementSource;
} {
  return {
    key: row.key,
    name: row.name,
    valueType: row.valueType,
    enabled: row.enabled,
    limit: row.limit,
    source: row.source,
  };
}
