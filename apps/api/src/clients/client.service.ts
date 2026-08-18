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
import type { TenantContext } from "../organizations/tenant.types";
import { tenantWhere } from "../organizations/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "./client-access.service";
import {
  CLIENT_ACCESS_DENIED,
  CLIENT_LIMIT_REACHED,
} from "./client.messages";
import type { CreateClientDto, ListClientsQueryDto, UpdateClientDto } from "./dto/client.dto";
import { ModuleRef } from "@nestjs/core";
import { ClientAccountService } from "../client-accounts/client-account.service";

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly entitlements: EntitlementService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
    private readonly moduleRef: ModuleRef,
  ) {}

  async list(tenant: TenantContext, query: ListClientsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ClientWhereInput = {
      ...this.access.visibleWhere(tenant),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.assignedMemberId
        ? {
            assignments: {
              some: { organizationMemberId: query.assignedMemberId, unassignedAt: null },
            },
          }
        : {}),
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
          assignments: {
            where: { unassignedAt: null },
            include: { organizationMember: { include: { user: true } } },
          },
          tags: { include: { tag: true } },
          account: true,
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

  async get(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, ...tenantWhere(tenant.organizationId) },
      include: {
        profile: true,
        account: true,
        assignments: {
          include: { organizationMember: { include: { user: true } } },
          orderBy: { assignedAt: "desc" },
        },
        tags: { include: { tag: true } },
      },
    });
    if (!client) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    return this.toDetail(client);
  }

  async create(tenant: TenantContext, input: CreateClientDto) {
    this.access.assertCanCreate(tenant);
    await this.assertClientLimit(tenant.organizationId);

    const assignedMemberId = input.assignedMemberId ?? (tenant.role === "DIETITIAN" ? tenant.membershipId : undefined);
    if (assignedMemberId) {
      await this.requireMember(tenant.organizationId, assignedMemberId);
    }

    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          organizationId: tenant.organizationId,
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
        data: { organizationId: tenant.organizationId, clientId: created.id },
      });

      if (assignedMemberId) {
        await tx.clientAssignment.create({
          data: {
            organizationId: tenant.organizationId,
            clientId: created.id,
            organizationMemberId: assignedMemberId,
            assignedById: tenant.userId,
          },
        });
      }

      if (input.tagIds?.length) {
        const tags = await tx.tag.findMany({
          where: { id: { in: input.tagIds }, organizationId: tenant.organizationId },
        });
        if (tags.length !== input.tagIds.length) {
          throw new BadRequestException("One or more tags are invalid");
        }
        await tx.clientTag.createMany({
          data: tags.map((tag) => ({
            organizationId: tenant.organizationId,
            clientId: created.id,
            tagId: tag.id,
          })),
        });
      }

      return created;
    });

    await this.timeline.record({
      organizationId: tenant.organizationId,
      clientId: client.id,
      type: "CLIENT_CREATED",
      actorUserId: tenant.userId,
      targetType: "client",
      targetId: client.id,
      metadata: { status: client.status },
    });
    if (assignedMemberId) {
      await this.timeline.record({
        organizationId: tenant.organizationId,
        clientId: client.id,
        type: "CLIENT_ASSIGNED",
        actorUserId: tenant.userId,
        targetType: "assignment",
        metadata: { organizationMemberId: assignedMemberId },
      });
    }
    await this.security.record({
      type: "client_created",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "client",
      targetId: client.id,
      metadata: { status: client.status },
    });

    if (input.invitePortal) {
      const accounts = this.moduleRef.get(ClientAccountService, { strict: false });
      await accounts.invite(tenant, client.id);
    }

    return this.get(tenant, client.id);
  }

  async update(tenant: TenantContext, clientId: string, input: UpdateClientDto) {
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
      organizationId: tenant.organizationId,
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
      organizationId: tenant.organizationId,
      targetType: "client",
      targetId: clientId,
    });
    return this.get(tenant, updated.id);
  }

  async archive(tenant: TenantContext, clientId: string) {
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
      organizationId: tenant.organizationId,
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
      organizationId: tenant.organizationId,
      targetType: "client",
      targetId: clientId,
    });
    return this.get(tenant, clientId);
  }

  async restore(tenant: TenantContext, clientId: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
    await this.access.assertCanAccess(tenant, clientId, "archive");
    const existing = await this.prisma.client.findFirst({
      where: { id: clientId, ...tenantWhere(tenant.organizationId) },
    });
    if (!existing) {
      throw new NotFoundException(CLIENT_ACCESS_DENIED);
    }
    await this.prisma.client.update({
      where: { id: clientId },
      data: { status, archivedAt: null },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
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
      organizationId: tenant.organizationId,
      targetType: "client",
      targetId: clientId,
      metadata: { status },
    });
    return this.get(tenant, clientId);
  }

  private async assertClientLimit(organizationId: string): Promise<void> {
    const entitlement = await this.entitlements.resolve(organizationId, FEATURE_KEYS.CLIENT_LIMIT);
    if (!entitlement.enabled) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
    if (entitlement.limit === null) {
      return;
    }
    const count = await this.prisma.client.count({
      where: { organizationId, status: { in: ["PENDING", "ACTIVE"] } },
    });
    if (count >= entitlement.limit) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
  }

  private async requireMember(organizationId: string, membershipId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: membershipId, organizationId, status: "ACTIVE" },
    });
    if (!member) {
      throw new BadRequestException("Assigned member is not available");
    }
    return member;
  }

  private toListItem(client: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string | null;
    status: string;
    createdAt: Date;
    assignments: Array<{
      organizationMember: { id: string; user: { email: string } };
    }>;
    tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
    account: { status: string } | null;
  }) {
    const assignment = client.assignments[0];
    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName,
      email: client.email,
      status: client.status,
      createdAt: client.createdAt.toISOString(),
      assignedTo: assignment
        ? { membershipId: assignment.organizationMember.id, email: assignment.organizationMember.user.email }
        : null,
      tags: client.tags.map((row) => row.tag),
      portalStatus: client.account?.status ?? null,
    };
  }

  private toDetail(client: Client & {
    profile: object | null;
    account: { status: string; activatedAt: Date | null } | null;
    assignments: Array<{
      id: string;
      assignedAt: Date;
      unassignedAt: Date | null;
      organizationMember: { id: string; user: { email: string } };
    }>;
    tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
  }) {
    return {
      id: client.id,
      organizationId: client.organizationId,
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
      assignments: client.assignments.map((row) => ({
        id: row.id,
        membershipId: row.organizationMember.id,
        email: row.organizationMember.user.email,
        assignedAt: row.assignedAt.toISOString(),
        unassignedAt: row.unassignedAt?.toISOString() ?? null,
        active: row.unassignedAt === null,
      })),
      tags: client.tags.map((row) => row.tag),
    };
  }
}
