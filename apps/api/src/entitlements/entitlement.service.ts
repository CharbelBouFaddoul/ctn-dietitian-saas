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

  async can(organizationId: string, featureKey: string): Promise<boolean> {
    const result = await this.resolve(organizationId, featureKey);
    return result.enabled;
  }

  async limit(organizationId: string, featureKey: string): Promise<number | null> {
    const result = await this.resolve(organizationId, featureKey);
    return result.limit;
  }

  async resolve(organizationId: string, featureKey: string): Promise<EntitlementResult> {
    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature || feature.status !== "ACTIVE") {
      return DENY;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
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
          organizationId_featureId: { organizationId, featureId: feature.id },
        },
      }),
    ]);

    return this.combine(planFeature, override);
  }

  async listEffective(organizationId: string): Promise<EffectiveFeatureEntitlement[]> {
    const [features, subscription, overrides] = await Promise.all([
      this.prisma.feature.findMany({ orderBy: { key: "asc" } }),
      this.prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: { include: { planFeatures: true } } },
      }),
      this.prisma.featureOverride.findMany({ where: { organizationId } }),
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
