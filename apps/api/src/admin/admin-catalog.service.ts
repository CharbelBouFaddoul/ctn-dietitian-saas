import { PLAN_FEATURE_DISPLAY_ORDER } from "@nutrition-saas/config";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CatalogStatus, FeatureValueType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";
import type { PlanFeatureInputDto } from "./dto/admin.dto";

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  listPlans() {
    return this.prisma.plan.findMany({
      include: { planFeatures: { include: { feature: true } }, _count: { select: { subscriptions: true } } },
      orderBy: { name: "asc" },
    });
  }

  async getPlan(planId: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: {
        planFeatures: { include: { feature: true }, orderBy: { feature: { key: "asc" } } },
        _count: { select: { subscriptions: true } },
      },
    });
    if (!plan) {
      throw new NotFoundException(ADMIN_MESSAGES.planNotFound);
    }
    return plan;
  }

  async createPlan(
    input: {
      name: string;
      slug: string;
      description?: string;
      priceCents?: number | null;
      currency?: string;
      showPrice?: boolean;
      listedPublicly?: boolean;
      durationDays?: number;
    },
    actor: AdminActor,
  ) {
    try {
      const plan = await this.prisma.plan.create({
        data: {
          name: input.name.trim(),
          slug: input.slug,
          description: input.description?.trim() ?? null,
          status: "ACTIVE",
          priceCents: input.priceCents ?? null,
          currency: input.currency?.trim().toUpperCase() || "USD",
          showPrice: input.showPrice ?? true,
          listedPublicly: input.listedPublicly ?? true,
          durationDays: input.durationDays ?? 30,
        },
      });
      await this.security.record({
        type: "plan_created",
        outcome: "success",
        userId: actor.userId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        requestId: actor.requestId,
        targetType: "plan",
        targetId: plan.id,
        metadata: { slug: plan.slug },
      });
      return plan;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Plan slug already exists");
      }
      throw error;
    }
  }

  async updatePlan(
    planId: string,
    input: {
      name?: string;
      description?: string;
      status?: CatalogStatus;
      priceCents?: number | null;
      currency?: string;
      showPrice?: boolean;
      listedPublicly?: boolean;
      durationDays?: number;
    },
    actor: AdminActor,
  ) {
    await this.getPlan(planId);
    const plan = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : input.description.trim(),
        status: input.status,
        priceCents: input.priceCents === undefined ? undefined : input.priceCents,
        currency: input.currency === undefined ? undefined : input.currency.trim().toUpperCase(),
        showPrice: input.showPrice,
        listedPublicly: input.listedPublicly,
        durationDays: input.durationDays,
      },
    });
    await this.security.record({
      type: "plan_updated",
      outcome: "success",
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "plan",
      targetId: plan.id,
      metadata: { slug: plan.slug, status: plan.status },
    });
    return plan;
  }

  async listPublicFeatures() {
    const features = await this.prisma.feature.findMany({
      where: { status: "ACTIVE" },
      select: { key: true, name: true, description: true, valueType: true },
    });
    return features.sort((a, b) => {
      const ai = PLAN_FEATURE_DISPLAY_ORDER.indexOf(a.key);
      const bi = PLAN_FEATURE_DISPLAY_ORDER.indexOf(b.key);
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  async listPublicPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { status: "ACTIVE", listedPublicly: true },
      include: {
        planFeatures: {
          include: { feature: true },
          orderBy: { feature: { name: "asc" } },
        },
      },
    });

    const slugOrder = ["standard", "pro", "premium"];

    return plans
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        durationDays: plan.durationDays,
        currency: plan.currency,
        priceCents: plan.showPrice ? plan.priceCents : null,
        showPrice: plan.showPrice,
        // Only features enabled on this plan and still active in the catalog.
        features: plan.planFeatures
          .filter((row) => row.enabled && row.feature.status === "ACTIVE")
          .map((row) => ({
            key: row.feature.key,
            name: row.feature.name,
            valueType: row.feature.valueType,
            limitValue: row.limitValue,
          }))
          .sort((a, b) => {
            const ai = PLAN_FEATURE_DISPLAY_ORDER.indexOf(a.key);
            const bi = PLAN_FEATURE_DISPLAY_ORDER.indexOf(b.key);
            if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          }),
      }))
      .sort((a, b) => {
        const ai = slugOrder.indexOf(a.slug);
        const bi = slugOrder.indexOf(b.slug);
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
  }

  async replacePlanFeatures(planId: string, features: PlanFeatureInputDto[], actor: AdminActor) {
    await this.getPlan(planId);
    const featureIds = features.map((row) => row.featureId);
    const catalog = await this.prisma.feature.findMany({ where: { id: { in: featureIds } } });
    if (catalog.length !== featureIds.length) {
      throw new BadRequestException(ADMIN_MESSAGES.featureNotFound);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.planFeature.deleteMany({ where: { planId } });
      await tx.planFeature.createMany({
        data: features.map((row) => ({
          planId,
          featureId: row.featureId,
          enabled: row.enabled,
          limitValue: row.limitValue ?? null,
        })),
      });
    });

    await this.security.record({
      type: "plan_features_changed",
      outcome: "success",
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "plan",
      targetId: planId,
      metadata: { featureCount: features.length },
    });

    return this.getPlan(planId);
  }

  listFeatures() {
    return this.prisma.feature.findMany({ orderBy: { key: "asc" } });
  }

  async createFeature(
    input: { key: string; name: string; description?: string; valueType: FeatureValueType },
    actor: AdminActor,
  ) {
    try {
      const feature = await this.prisma.feature.create({
        data: {
          key: input.key,
          name: input.name.trim(),
          description: input.description?.trim() ?? null,
          valueType: input.valueType,
          status: "ACTIVE",
        },
      });
      await this.security.record({
        type: "feature_created",
        outcome: "success",
        userId: actor.userId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        requestId: actor.requestId,
        targetType: "feature",
        targetId: feature.id,
        metadata: { key: feature.key, valueType: feature.valueType },
      });
      return feature;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Feature key already exists");
      }
      throw error;
    }
  }

  async updateFeature(
    featureId: string,
    input: { name?: string; description?: string; status?: CatalogStatus },
    actor: AdminActor,
  ) {
    const existing = await this.prisma.feature.findUnique({ where: { id: featureId } });
    if (!existing) {
      throw new NotFoundException(ADMIN_MESSAGES.featureNotFound);
    }
    const feature = await this.prisma.feature.update({
      where: { id: featureId },
      data: {
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : input.description.trim(),
        status: input.status,
      },
    });
    await this.security.record({
      type: "feature_updated",
      outcome: "success",
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "feature",
      targetId: feature.id,
      metadata: { key: feature.key, status: feature.status },
    });
    return feature;
  }
}
