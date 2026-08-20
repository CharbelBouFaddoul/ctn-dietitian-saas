import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { OrganizationLifecycleService } from "../organizations/organization-lifecycle.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";

type AccountStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/** Phase 1 admin APIs: organizationId path param is DietitianAccount.id */
@Injectable()
export class AdminOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrganizationLifecycleService,
    private readonly entitlements: EntitlementService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(search?: string) {
    const accounts = await this.prisma.dietitianAccount.findMany({
      where: search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return accounts.map((account) => this.toListItem(account));
  }

  async get(organizationId: string) {
    const account = await this.requireAccount(organizationId);
    const entitlements = await this.entitlements.listEffective(organizationId);
    return {
      id: account.id,
      name: account.displayName,
      slug: account.slug,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      archivedAt: account.archivedAt?.toISOString() ?? null,
      suspendedAt: account.suspendedAt?.toISOString() ?? null,
      settings: account.settings
        ? {
            timezone: account.settings.timezone,
            locale: account.settings.locale,
            currency: account.settings.currency,
            weightUnit: account.settings.weightUnit,
            heightUnit: account.settings.heightUnit,
            dateFormat: account.settings.dateFormat,
          }
        : null,
      members: [
        {
          id: account.id,
          userId: account.userId,
          email: account.user.email,
          role: "OWNER",
          status: "ACTIVE",
        },
      ],
      subscription: account.subscription ? this.toSubscription(account.subscription) : null,
      entitlements,
    };
  }

  async setStatus(organizationId: string, status: AccountStatus, actor: AdminActor) {
    await this.requireAccount(organizationId);
    if (status !== "ACTIVE" && status !== "SUSPENDED" && status !== "ARCHIVED") {
      throw new BadRequestException("Invalid dietitian account status");
    }
    const organization = await this.lifecycle.setStatus(organizationId, status, actor.userId);
    await this.security.record({
      type: "admin_organization_status_changed",
      outcome: "success",
      userId: actor.userId,
      organizationId,
      dietitianAccountId: organizationId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "organization",
      targetId: organizationId,
      metadata: { status },
    });
    return organization;
  }

  async entitlementsFor(organizationId: string) {
    await this.requireAccount(organizationId);
    return this.entitlements.listEffective(organizationId);
  }

  private async requireAccount(dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      include: {
        settings: true,
        user: true,
        subscription: { include: { plan: true } },
      },
    });
    if (!account) {
      throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);
    }
    return account;
  }

  private toListItem(account: {
    id: string;
    displayName: string;
    slug: string;
    status: string;
    createdAt: Date;
    subscription: {
      status: string;
      plan: { id: string; name: string; slug: string };
    } | null;
  }) {
    return {
      id: account.id,
      name: account.displayName,
      slug: account.slug,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      subscription: account.subscription
        ? {
            status: account.subscription.status,
            plan: account.subscription.plan,
          }
        : null,
    };
  }

  private toSubscription(subscription: {
    id: string;
    status: string;
    startedAt: Date | null;
    cancelledAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    plan: { id: string; name: string; slug: string; status: string };
  }) {
    return {
      id: subscription.id,
      status: subscription.status,
      startedAt: subscription.startedAt?.toISOString() ?? null,
      cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      plan: subscription.plan,
    };
  }
}
