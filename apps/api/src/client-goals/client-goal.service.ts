import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";

@Injectable()
export class ClientGoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const goals = await this.prisma.clientGoal.findMany({
      where: { clientId, organizationId: tenant.organizationId },
      orderBy: { createdAt: "desc" },
    });
    return goals.map((goal) => this.toResponse(goal));
  }

  async create(
    tenant: TenantContext,
    clientId: string,
    input: { title: string; description?: string; targetValue?: number; targetUnit?: string; startDate?: string; targetDate?: string },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const goal = await this.prisma.clientGoal.create({
      data: {
        organizationId: tenant.organizationId,
        clientId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        targetValue: input.targetValue ?? null,
        targetUnit: input.targetUnit ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        createdById: tenant.userId,
      },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      clientId,
      type: "GOAL_CREATED",
      actorUserId: tenant.userId,
      targetType: "goal",
      targetId: goal.id,
      metadata: { title: goal.title },
    });
    await this.security.record({
      type: "goal_created",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "goal",
      targetId: goal.id,
    });
    return this.toResponse(goal);
  }

  async complete(tenant: TenantContext, clientId: string, goalId: string) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.prisma.clientGoal.findFirst({
      where: { id: goalId, clientId, organizationId: tenant.organizationId },
    });
    if (!existing) {
      throw new NotFoundException("Goal not found");
    }
    const goal = await this.prisma.clientGoal.update({
      where: { id: goalId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      clientId,
      type: "GOAL_COMPLETED",
      actorUserId: tenant.userId,
      targetType: "goal",
      targetId: goal.id,
    });
    await this.security.record({
      type: "goal_completed",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "goal",
      targetId: goal.id,
    });
    return this.toResponse(goal);
  }

  async cancel(tenant: TenantContext, clientId: string, goalId: string) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.prisma.clientGoal.findFirst({
      where: { id: goalId, clientId, organizationId: tenant.organizationId },
    });
    if (!existing) {
      throw new NotFoundException("Goal not found");
    }
    const goal = await this.prisma.clientGoal.update({
      where: { id: goalId },
      data: { status: "CANCELLED" },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      clientId,
      type: "GOAL_CANCELLED",
      actorUserId: tenant.userId,
      targetType: "goal",
      targetId: goal.id,
    });
    return this.toResponse(goal);
  }

  private toResponse(goal: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    targetValue: unknown;
    targetUnit: string | null;
    startDate: Date | null;
    targetDate: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      targetValue: goal.targetValue === null ? null : Number(goal.targetValue),
      targetUnit: goal.targetUnit,
      startDate: goal.startDate?.toISOString().slice(0, 10) ?? null,
      targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? null,
      completedAt: goal.completedAt?.toISOString() ?? null,
      createdAt: goal.createdAt.toISOString(),
    };
  }
}
