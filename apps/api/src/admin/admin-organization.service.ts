import { Injectable, NotFoundException } from "@nestjs/common";
import type { OrganizationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { OrganizationLifecycleService } from "../organizations/organization-lifecycle.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";

@Injectable()
export class AdminOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrganizationLifecycleService,
    private readonly entitlements: EntitlementService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(search?: string) {
    const organizations = await this.prisma.organization.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return organizations.map((organization) => this.toListItem(organization));
  }

  async get(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        settings: true,
        members: { include: { user: true }, orderBy: { createdAt: "asc" } },
        subscription: { include: { plan: true } },
      },
    });
    if (!organization) {
      throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);
    }

    const entitlements = await this.entitlements.listEffective(organizationId);
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      createdAt: organization.createdAt.toISOString(),
      archivedAt: organization.archivedAt?.toISOString() ?? null,
      suspendedAt: organization.suspendedAt?.toISOString() ?? null,
      settings: organization.settings
        ? {
            timezone: organization.settings.timezone,
            locale: organization.settings.locale,
            currency: organization.settings.currency,
            weightUnit: organization.settings.weightUnit,
            heightUnit: organization.settings.heightUnit,
            dateFormat: organization.settings.dateFormat,
          }
        : null,
      members: organization.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        role: member.role,
        status: member.status,
      })),
      subscription: organization.subscription
        ? this.toSubscription(organization.subscription)
        : null,
      entitlements,
    };
  }

  async setStatus(organizationId: string, status: OrganizationStatus, actor: AdminActor) {
    await this.requireOrganization(organizationId);
    const organization = await this.lifecycle.setStatus(organizationId, status, actor.userId);
    await this.security.record({
      type: "admin_organization_status_changed",
      outcome: "success",
      userId: actor.userId,
      organizationId,
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
    await this.requireOrganization(organizationId);
    return this.entitlements.listEffective(organizationId);
  }

  private async requireOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);
    }
    return organization;
  }

  private toListItem(organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: Date;
    subscription: {
      status: string;
      plan: { id: string; name: string; slug: string };
    } | null;
  }) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      createdAt: organization.createdAt.toISOString(),
      subscription: organization.subscription
        ? {
            status: organization.subscription.status,
            plan: organization.subscription.plan,
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
