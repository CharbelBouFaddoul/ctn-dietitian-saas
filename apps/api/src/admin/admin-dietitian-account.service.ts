import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { DietitianLifecycleService } from "../dietitian/dietitian-lifecycle.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";
import { AdminSubscriptionService } from "./admin-subscription.service";

type AccountStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/** Admin APIs: dietitianAccountId path param is DietitianAccount.id */
@Injectable()
export class AdminDietitianAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: DietitianLifecycleService,
    private readonly entitlements: EntitlementService,
    private readonly subscriptions: AdminSubscriptionService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(search?: string) {
    const accounts = await this.prisma.dietitianAccount.findMany({
      where: search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : undefined,
      include: {
        subscription: { include: { plan: true } },
        user: { select: { email: true } },
        _count: {
          select: { clients: { where: { status: { in: ["PENDING", "ACTIVE"] } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return accounts.map((account) => this.toListItem(account));
  }

  async get(dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      include: {
        settings: true,
        subscription: { include: { plan: true } },
        user: { select: { id: true, email: true, status: true, firstName: true, lastName: true } },
      },
    });
    if (!account) {
      throw new NotFoundException(ADMIN_MESSAGES.dietitianAccountNotFound);
    }
    const entitlements = await this.entitlements.listEffective(dietitianAccountId);
    const patientCount = await this.prisma.client.count({
      where: { dietitianAccountId, status: { in: ["PENDING", "ACTIVE"] } },
    });
    return {
      id: account.id,
      name: account.displayName,
      slug: account.slug,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      archivedAt: account.archivedAt?.toISOString() ?? null,
      suspendedAt: account.suspendedAt?.toISOString() ?? null,
      patientCount,
      owner: account.user
        ? {
            id: account.user.id,
            email: account.user.email,
            status: account.user.status,
            firstName: account.user.firstName,
            lastName: account.user.lastName,
          }
        : null,
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
      subscription: account.subscription
        ? await this.subscriptions.getForDietitianAccount(dietitianAccountId)
        : null,
      entitlements,
    };
  }

  async setStatus(dietitianAccountId: string, status: AccountStatus, actor: AdminActor) {
    await this.requireAccount(dietitianAccountId);
    if (status !== "ACTIVE" && status !== "SUSPENDED" && status !== "ARCHIVED") {
      throw new BadRequestException("Invalid dietitian account status");
    }
    const account = await this.lifecycle.setStatus(dietitianAccountId, status, actor.userId);
    await this.security.record({
      type: "admin_dietitian_account_status_changed",
      outcome: "success",
      userId: actor.userId,
      dietitianAccountId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "dietitian_account",
      targetId: dietitianAccountId,
      metadata: { status },
    });
    return account;
  }

  async entitlementsFor(dietitianAccountId: string) {
    await this.requireAccount(dietitianAccountId);
    return this.entitlements.listEffective(dietitianAccountId);
  }

  async listClients(dietitianAccountId: string) {
    await this.requireAccount(dietitianAccountId);
    const where = { dietitianAccountId };
    const [total, clients] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              status: true,
              user: { select: { id: true, email: true, status: true } },
            },
          },
        },
        orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
        take: 200,
      }),
    ]);

    return {
      total,
      items: clients.map((client) => ({
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        displayName: client.displayName,
        email: client.email,
        phone: client.phone,
        status: client.status,
        isTrialSeed: client.isTrialSeed,
        createdAt: client.createdAt.toISOString(),
        portalUser: client.account?.user
          ? {
              id: client.account.user.id,
              email: client.account.user.email,
              status: client.account.user.status,
              accountStatus: client.account.status,
            }
          : null,
      })),
    };
  }

  private async requireAccount(dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      include: {
        settings: true,
        subscription: { include: { plan: true } },
      },
    });
    if (!account) {
      throw new NotFoundException(ADMIN_MESSAGES.dietitianAccountNotFound);
    }
    return account;
  }

  private toListItem(account: {
    id: string;
    displayName: string;
    slug: string;
    status: string;
    createdAt: Date;
    user?: { email: string } | null;
    _count?: { clients: number };
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
      ownerEmail: account.user?.email ?? null,
      createdAt: account.createdAt.toISOString(),
      patientCount: account._count?.clients ?? 0,
      subscription: account.subscription
        ? {
            status: account.subscription.status,
            plan: account.subscription.plan,
          }
        : null,
    };
  }
}
