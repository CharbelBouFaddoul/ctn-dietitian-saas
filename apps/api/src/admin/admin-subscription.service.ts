import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";

/** Phase 1: organizationId argument is DietitianAccount.id */
@Injectable()
export class AdminSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
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

    return subscriptions.map((subscription) => ({
      id: subscription.id,
      status: subscription.status,
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
    }));
  }

  async getForOrganization(organizationId: string) {
    await this.requireAccount(organizationId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId: organizationId },
      include: { plan: true },
    });
    return subscription ? this.toResponse(subscription) : null;
  }

  async assign(organizationId: string, planId: string, actor: AdminActor, status: SubscriptionStatus = "ACTIVE") {
    const account = await this.requireAccount(organizationId);
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(ADMIN_MESSAGES.planNotFound);
    }
    if (plan.status !== "ACTIVE") {
      throw new BadRequestException(ADMIN_MESSAGES.planNotAssignable);
    }

    const existing = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId: organizationId },
    });
    const now = new Date();
    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: {
            planId,
            status,
            startedAt: existing.startedAt ?? now,
            cancelledAt: status === "CANCELLED" ? now : null,
            currentPeriodStart: status === "ACTIVE" ? now : existing.currentPeriodStart,
          },
          include: { plan: true },
        })
      : await this.prisma.subscription.create({
          data: {
            dietitianAccountId: organizationId,
            organizationId: account.legacyOrganizationId ?? organizationId,
            planId,
            status,
            startedAt: status === "ACTIVE" ? now : null,
            currentPeriodStart: status === "ACTIVE" ? now : null,
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
      metadata: { planSlug: plan.slug, status },
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

    const now = new Date();
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
      metadata: { status, planSlug: subscription.plan.slug },
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
    if (status === "ACTIVE") {
      return "subscription_changed";
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

  private toResponse(subscription: {
    id: string;
    organizationId: string | null;
    dietitianAccountId?: string | null;
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
    return {
      id: subscription.id,
      organizationId: subscription.dietitianAccountId ?? subscription.organizationId,
      status: subscription.status,
      startedAt: subscription.startedAt?.toISOString() ?? null,
      cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      billingCycle: subscription.billingCycle,
      provider: subscription.provider,
      externalId: subscription.externalId,
      paymentStatus: subscription.paymentStatus,
      plan: subscription.plan,
    };
  }
}
