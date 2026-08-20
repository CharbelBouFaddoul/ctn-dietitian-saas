import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import type { Client, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { EntitlementService } from "../entitlements/entitlement.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "./client-access.service";
import {
  CLIENT_ACCESS_DENIED,
  CLIENT_LIMIT_REACHED,
} from "./client.messages";
import { deriveConnectionStatus } from "./portal-connection";
import type { CreateClientDto, ListClientsQueryDto, UpdateClientDto } from "./dto/client.dto";

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly entitlements: EntitlementService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(tenant: DietitianTenantContext, query: ListClientsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ClientWhereInput = {
      ...this.access.visibleWhere(tenant),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" } },
              { lastName: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { displayName: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: {
          dietitianAccount: { include: { user: { select: { email: true } } } },
          tags: { include: { tag: true } },
          account: true,
          invitations: {
            where: { purpose: "CLIENT_INVITE", usedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async get(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, ...tenantWhere(tenant.dietitianAccountId) },
      include: {
        profile: true,
        account: true,
        dietitianAccount: { include: { user: { select: { email: true } } } },
        tags: { include: { tag: true } },
        invitations: {
          where: { purpose: "CLIENT_INVITE", usedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!client) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    return this.toDetail(client);
  }

  async create(tenant: DietitianTenantContext, input: CreateClientDto) {
    this.access.assertCanCreate(tenant);
    await this.assertClientLimit(tenant.dietitianAccountId);

    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          displayName: input.displayName?.trim() || `${input.firstName.trim()} ${input.lastName.trim()}`,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          sex: input.sex ?? null,
          status: input.status ?? "ACTIVE",
          createdById: tenant.userId,
        },
      });

      await tx.clientProfile.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          clientId: created.id,
        },
      });

      if (input.tagIds?.length) {
        const tags = await tx.tag.findMany({
          where: { id: { in: input.tagIds }, ...tenantWhere(tenant.dietitianAccountId) },
        });
        if (tags.length !== input.tagIds.length) {
          throw new BadRequestException("One or more tags are invalid");
        }
        await tx.clientTag.createMany({
          data: tags.map((tag) => ({
            dietitianAccountId: tenant.dietitianAccountId,
            clientId: created.id,
            tagId: tag.id,
          })),
        });
      }

      return created;
    });

    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: client.id,
      type: "CLIENT_CREATED",
      actorUserId: tenant.userId,
      targetType: "client",
      targetId: client.id,
      metadata: { status: client.status },
    });
    await this.security.record({
      type: "client_created",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "client",
      targetId: client.id,
      metadata: { status: client.status },
    });

    return this.get(tenant, client.id);
  }

  async update(tenant: DietitianTenantContext, clientId: string, input: UpdateClientDto) {
    await this.access.assertCanAccess(tenant, clientId, "update");
    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName?.trim(),
        displayName: input.displayName?.trim(),
        email: input.email === undefined ? undefined : input.email.trim(),
        phone: input.phone === undefined ? undefined : input.phone.trim(),
        dateOfBirth: input.dateOfBirth === undefined ? undefined : new Date(input.dateOfBirth),
        sex: input.sex,
      },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId,
      type: "CLIENT_UPDATED",
      actorUserId: tenant.userId,
      targetType: "client",
      targetId: clientId,
    });
    await this.security.record({
      type: "client_updated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "client",
      targetId: clientId,
    });
    return this.get(tenant, updated.id);
  }

  async archive(tenant: DietitianTenantContext, clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "archive");
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await tx.clientAssignment.updateMany({
        where: { clientId, unassignedAt: null },
        data: { unassignedAt: new Date() },
      });
      await tx.clientAccount.updateMany({
        where: { clientId, status: { not: "DEACTIVATED" } },
        data: { status: "DEACTIVATED", deactivatedAt: new Date() },
      });
      const account = await tx.clientAccount.findUnique({ where: { clientId } });
      if (account) {
        await tx.session.updateMany({
          where: { userId: account.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId,
      type: "CLIENT_ARCHIVED",
      actorUserId: tenant.userId,
      targetType: "client",
      targetId: clientId,
      metadata: { previousStatus: client.status },
    });
    await this.security.record({
      type: "client_archived",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "client",
      targetId: clientId,
    });
    return this.get(tenant, clientId);
  }

  async restore(tenant: DietitianTenantContext, clientId: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
    await this.access.assertCanAccess(tenant, clientId, "archive");
    const existing = await this.prisma.client.findFirst({
      where: { id: clientId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!existing) {
      throw new NotFoundException(CLIENT_ACCESS_DENIED);
    }
    if (
      status === "ACTIVE" &&
      existing.status !== "ACTIVE" &&
      existing.status !== "PENDING"
    ) {
      await this.assertClientLimit(tenant.dietitianAccountId);
    }
    await this.prisma.client.update({
      where: { id: clientId },
      data: { status, archivedAt: null },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId,
      type: "CLIENT_RESTORED",
      actorUserId: tenant.userId,
      targetType: "client",
      targetId: clientId,
      metadata: { status },
    });
    await this.security.record({
      type: "client_restored",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "client",
      targetId: clientId,
    });
    return this.get(tenant, clientId);
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
      where: { ...tenantWhere(dietitianAccountId), status: { in: ["PENDING", "ACTIVE"] } },
    });
    if (count >= entitlement.limit) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
  }

  private toListItem(client: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string | null;
    status: string;
    createdAt: Date;
    dietitianAccount: { id: string; user: { email: string } } | null;
    tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
    account: { status: string } | null;
    invitations: Array<{ expiresAt: Date }>;
  }) {
    const connectionStatus = deriveConnectionStatus(client.account, client.invitations[0]);
    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName,
      email: client.email,
      status: client.status,
      createdAt: client.createdAt.toISOString(),
      assignedTo: client.dietitianAccount
        ? { dietitianAccountId: client.dietitianAccount.id, email: client.dietitianAccount.user.email }
        : null,
      tags: client.tags.map((row) => row.tag),
      portalStatus: client.account?.status ?? null,
      connectionStatus,
    };
  }

  private toDetail(client: Client & {
    profile: object | null;
    account: { status: string; activatedAt: Date | null } | null;
    dietitianAccount: { id: string; user: { email: string }; createdAt: Date } | null;
    tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
    invitations: Array<{ expiresAt: Date }>;
  }) {
    const connectionStatus = deriveConnectionStatus(client.account, client.invitations[0]);
    const owner = client.dietitianAccount;
    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName,
      email: client.email,
      phone: client.phone,
      dateOfBirth: client.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      sex: client.sex,
      status: client.status,
      archivedAt: client.archivedAt?.toISOString() ?? null,
      createdAt: client.createdAt.toISOString(),
      profile: client.profile,
      portalStatus: client.account?.status ?? null,
      portalActivatedAt: client.account?.activatedAt?.toISOString() ?? null,
      connectionStatus,
      assignments: owner
        ? [
            {
              id: owner.id,
              dietitianAccountId: owner.id,
              email: owner.user.email,
              assignedAt: owner.createdAt.toISOString(),
              unassignedAt: null,
              active: true,
            },
          ]
        : [],
      tags: client.tags.map((row) => row.tag),
    };
  }
}
