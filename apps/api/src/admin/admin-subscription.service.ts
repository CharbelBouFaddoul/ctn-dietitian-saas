import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import type { BillingCycle, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { SubscriptionLifecycleService } from "../entitlements/subscription-lifecycle.service";
import { tenantWhere } from "../organizations/tenant-scope";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";

export type AssignSubscriptionInput = {
  planId: string;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  currentPeriodStart?: string | null;
  billingCycle?: BillingCycle | null;
};

export type RenewSubscriptionInput = {
  planId?: string;
  currentPeriodEnd?: string | null;
  billingCycle?: BillingCycle | null;
};

/** Phase 1: organizationId argument is DietitianAccount.id */
@Injectable()
export class AdminSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async list() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: {
        plan: true,
        dietitianAccount: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return Promise.all(
      subscriptions.map(async (subscription) => {
        const enriched = await this.enrich({
          dietitianAccountId: subscription.dietitianAccountId,
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          plan: subscription.plan,
        });
        return {
          id: subscription.id,
          status: subscription.status,
          accessState: enriched.accessState,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          organization: subscription.dietitianAccount
            ? {
                id: subscription.dietitianAccount.id,
                name: subscription.dietitianAccount.displayName,
                slug: subscription.dietitianAccount.slug,
              }
            : null,
          plan: {
            id: subscription.plan.id,
            name: subscription.plan.name,
            slug: subscription.plan.slug,
            status: subscription.plan.status,
          },
          startedAt: subscription.startedAt?.toISOString() ?? null,
          cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
          clientCount: enriched.clientCount,
          clientLimit: enriched.clientLimit,
        };
      }),
    );
  }

  async getForOrganization(organizationId: string) {
    await this.requireAccount(organizationId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId: organizationId },
      include: { plan: true },
    });
    return subscription ? this.toResponse(subscription) : null;
  }

  async assign(organizationId: string, input: AssignSubscriptionInput, actor: AdminActor) {
    const account = await this.requireAccount(organizationId);
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw new NotFoundException(ADMIN_MESSAGES.planNotFound);
    }
    if (plan.status !== "ACTIVE") {
      throw new BadRequestException(ADMIN_MESSAGES.planNotAssignable);
    }

    const status = input.status ?? "ACTIVE";
    const existing = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId: organizationId },
    });
    const now = this.lifecycle.now();
    const periodEnd = parseOptionalDate(input.currentPeriodEnd, "currentPeriodEnd");
    const periodStart = parseOptionalDate(input.currentPeriodStart, "currentPeriodStart");

    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: {
            planId: input.planId,
            status,
            startedAt: existing.startedAt ?? (status === "ACTIVE" ? now : null),
            cancelledAt: status === "CANCELLED" ? now : null,
            currentPeriodStart:
              periodStart ?? (status === "ACTIVE" ? now : existing.currentPeriodStart),
            currentPeriodEnd: input.currentPeriodEnd !== undefined ? periodEnd : existing.currentPeriodEnd,
            billingCycle:
              input.billingCycle !== undefined ? input.billingCycle : existing.billingCycle,
          },
          include: { plan: true },
        })
      : await this.prisma.subscription.create({
          data: {
            dietitianAccountId: organizationId,
            organizationId: account.legacyOrganizationId ?? organizationId,
            planId: input.planId,
            status,
            startedAt: status === "ACTIVE" ? now : null,
            currentPeriodStart: periodStart ?? (status === "ACTIVE" ? now : null),
            currentPeriodEnd: periodEnd,
            billingCycle: input.billingCycle ?? null,
          },
          include: { plan: true },
        });

    await this.security.record({
      type: existing ? "subscription_changed" : "subscription_assigned",
      outcome: "success",
      userId: actor.userId,
      organizationId,
      dietitianAccountId: organizationId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "subscription",
      targetId: subscription.id,
      metadata: {
        planSlug: plan.slug,
        status,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    });

    return this.toResponse(subscription);
  }

  async renew(organizationId: string, input: RenewSubscriptionInput, actor: AdminActor) {
    const existing = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId: organizationId },
      include: { plan: true },
    });
    if (!existing) {
      throw new NotFoundException(ADMIN_MESSAGES.noSubscription);
    }

    let planId = existing.planId;
    let planSlug = existing.plan.slug;
    if (input.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
      if (!plan) {
        throw new NotFoundException(ADMIN_MESSAGES.planNotFound);
      }
      if (plan.status !== "ACTIVE") {
        throw new BadRequestException(ADMIN_MESSAGES.planNotAssignable);
      }
      planId = plan.id;
      planSlug = plan.slug;
    }

    const now = this.lifecycle.now();
    const periodEnd =
      input.currentPeriodEnd !== undefined
        ? parseOptionalDate(input.currentPeriodEnd, "currentPeriodEnd")
        : existing.currentPeriodEnd;

    const subscription = await this.prisma.subscription.update({
      where: { id: existing.id },
      data: {
        planId,
        status: "ACTIVE",
        cancelledAt: null,
        startedAt: existing.startedAt ?? now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        billingCycle:
          input.billingCycle !== undefined ? input.billingCycle : existing.billingCycle,
      },
      include: { plan: true },
    });

    await this.security.record({
      type: "subscription_renewed",
      outcome: "success",
      userId: actor.userId,
      organizationId,
      dietitianAccountId: organizationId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "subscription",
      targetId: subscription.id,
      metadata: {
        planSlug,
        status: "ACTIVE",
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    });

    return this.toResponse(subscription);
  }

  async setStatus(organizationId: string, status: SubscriptionStatus, actor: AdminActor) {
    const existing = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId: organizationId },
      include: { plan: true },
    });
    if (!existing) {
      throw new NotFoundException(ADMIN_MESSAGES.noSubscription);
    }

    const now = this.lifecycle.now();
    const subscription = await this.prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status,
        cancelledAt: status === "CANCELLED" ? now : null,
        startedAt: status === "ACTIVE" ? (existing.startedAt ?? now) : existing.startedAt,
        currentPeriodStart: status === "ACTIVE" ? now : existing.currentPeriodStart,
      },
      include: { plan: true },
    });

    await this.security.record({
      type: this.statusAction(status),
      outcome: "success",
      userId: actor.userId,
      organizationId,
      dietitianAccountId: organizationId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "subscription",
      targetId: subscription.id,
      metadata: {
        status,
        planSlug: subscription.plan.slug,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    });

    return this.toResponse(subscription);
  }

  private statusAction(status: SubscriptionStatus): string {
    if (status === "SUSPENDED") {
      return "subscription_suspended";
    }
    if (status === "CANCELLED") {
      return "subscription_cancelled";
    }
    return "subscription_changed";
  }

  private async requireAccount(dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
    });
    if (!account) {
      throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);
    }
    return account;
  }

  private async enrich(subscription: {
    dietitianAccountId: string | null;
    planId: string;
    status: string;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    plan: { slug: string; name: string };
  }) {
    const dietitianAccountId = subscription.dietitianAccountId;
    const access = this.lifecycle.derive({
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      plan: subscription.plan,
    });
    let clientCount: number | null = null;
    let clientLimit: number | null = null;
    if (dietitianAccountId) {
      clientCount = await this.prisma.client.count({
        where: { ...tenantWhere(dietitianAccountId), status: { in: ["PENDING", "ACTIVE"] } },
      });
      const feature = await this.prisma.feature.findUnique({
        where: { key: FEATURE_KEYS.CLIENT_LIMIT },
      });
      if (feature) {
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
        if (override?.limitValue !== undefined && override.limitValue !== null) {
          clientLimit = override.limitValue;
        } else if (planFeature?.enabled) {
          clientLimit = planFeature.limitValue;
        } else {
          clientLimit = 0;
        }
      }
    }
    return {
      accessState: access.accessState,
      graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
      readOnlyEndsAt: access.readOnlyEndsAt?.toISOString() ?? null,
      daysRemainingInPhase: access.daysRemainingInPhase,
      clientCount,
      clientLimit,
    };
  }

  private async toResponse(subscription: {
    id: string;
    organizationId: string | null;
    dietitianAccountId?: string | null;
    planId: string;
    status: string;
    startedAt: Date | null;
    cancelledAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    billingCycle: string | null;
    provider: string | null;
    externalId: string | null;
    paymentStatus: string | null;
    plan: { id: string; name: string; slug: string; status: string };
  }) {
    const enriched = await this.enrich({
      dietitianAccountId: subscription.dietitianAccountId ?? null,
      planId: subscription.planId,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      plan: subscription.plan,
    });

    return {
      id: subscription.id,
      organizationId: subscription.dietitianAccountId ?? subscription.organizationId,
      status: subscription.status,
      accessState: enriched.accessState,
      startedAt: subscription.startedAt?.toISOString() ?? null,
      cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: enriched.graceEndsAt,
      readOnlyEndsAt: enriched.readOnlyEndsAt,
      daysRemainingInPhase: enriched.daysRemainingInPhase,
      clientCount: enriched.clientCount,
      clientLimit: enriched.clientLimit,
      billingCycle: subscription.billingCycle,
      provider: subscription.provider,
      externalId: subscription.externalId,
      paymentStatus: subscription.paymentStatus,
      plan: subscription.plan,
    };
  }
}

function parseOptionalDate(value: string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return parsed;
}
