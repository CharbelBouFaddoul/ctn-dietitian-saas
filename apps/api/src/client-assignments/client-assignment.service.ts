import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";

@Injectable()
export class ClientAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.clientAssignment.findMany({
      where: { clientId, organizationId: tenant.organizationId },
      include: { organizationMember: { include: { user: true } } },
      orderBy: { assignedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      membershipId: row.organizationMemberId,
      email: row.organizationMember.user.email,
      assignedAt: row.assignedAt.toISOString(),
      unassignedAt: row.unassignedAt?.toISOString() ?? null,
      active: row.unassignedAt === null,
    }));
  }

  async assign(tenant: TenantContext, clientId: string, organizationMemberId: string) {
    await this.access.assertCanAccess(tenant, clientId, "assign");
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: organizationMemberId, organizationId: tenant.organizationId, status: "ACTIVE" },
    });
    if (!member) {
      throw new BadRequestException("Assigned member is not available");
    }

    const current = await this.prisma.clientAssignment.findFirst({
      where: { clientId, unassignedAt: null },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      if (current) {
        if (current.organizationMemberId === organizationMemberId) {
          return current;
        }
        await tx.clientAssignment.update({
          where: { id: current.id },
          data: { unassignedAt: new Date() },
        });
      }
      return tx.clientAssignment.create({
        data: {
          organizationId: tenant.organizationId,
          clientId,
          organizationMemberId,
          assignedById: tenant.userId,
        },
      });
    });

    if (!current || current.organizationMemberId !== organizationMemberId) {
      if (current) {
        await this.timeline.record({
          organizationId: tenant.organizationId,
          clientId,
          type: "CLIENT_UNASSIGNED",
          actorUserId: tenant.userId,
          targetType: "assignment",
          targetId: current.id,
        });
      }
      await this.timeline.record({
        organizationId: tenant.organizationId,
        clientId,
        type: "CLIENT_ASSIGNED",
        actorUserId: tenant.userId,
        targetType: "assignment",
        targetId: created.id,
        metadata: { organizationMemberId },
      });
      await this.security.record({
        type: "client_assignment_changed",
        outcome: "success",
        userId: tenant.userId,
        organizationId: tenant.organizationId,
        targetType: "client",
        targetId: clientId,
        metadata: { organizationMemberId },
      });
    }

    return this.list(tenant, clientId);
  }
}
