import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { ClientAccessService } from "../clients/client-access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { TimelineService } from "../timeline/timeline.service";
import { NotificationService } from "../notifications/notification.service";

export type TaskView = "all" | "mine" | "due_today" | "upcoming" | "overdue" | "completed";

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    tenant: TenantContext,
    query: {
      view?: TaskView;
      status?: TaskStatus;
      priority?: TaskPriority;
      clientId?: string;
      assignedMemberId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const visible = this.access.visibleWhere(tenant);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    let dueFilter: Prisma.TaskWhereInput = {};
    if (query.view === "due_today") {
      dueFilter = { dueAt: { gte: startOfToday, lte: endOfToday }, status: { in: ["TODO", "IN_PROGRESS"] } };
    } else if (query.view === "upcoming") {
      dueFilter = { dueAt: { gt: endOfToday }, status: { in: ["TODO", "IN_PROGRESS"] } };
    } else if (query.view === "overdue") {
      dueFilter = { dueAt: { lt: new Date() }, status: { in: ["TODO", "IN_PROGRESS"] } };
    } else if (query.view === "completed") {
      dueFilter = { status: "COMPLETED" };
    } else if (query.view === "mine") {
      dueFilter = { assignedMemberId: tenant.membershipId };
    }

    const where: Prisma.TaskWhereInput = {
      organizationId: tenant.organizationId,
      archivedAt: null,
      AND: [
        {
          OR: [{ clientId: null }, { client: visible }],
        },
        dueFilter,
      ],
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.assignedMemberId ? { assignedMemberId: query.assignedMemberId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          client: true,
          assignedMember: { include: { user: true } },
          createdBy: true,
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
    };
  }

  async listForClient(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.task.findMany({
      where: { organizationId: tenant.organizationId, clientId, archivedAt: null },
      include: {
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(tenant: TenantContext, taskId: string) {
    const task = await this.findTask(tenant, taskId);
    return this.toResponse(task);
  }

  async create(
    tenant: TenantContext,
    input: {
      title: string;
      description?: string;
      clientId?: string;
      assignedMemberId?: string;
      priority?: TaskPriority;
      dueAt?: string;
    },
  ) {
    if (tenant.role === "STAFF") {
      throw new ForbiddenException("Staff cannot create tasks");
    }
    if (input.clientId) {
      await this.access.assertCanAccess(tenant, input.clientId, "manageRecords");
    }
    const assignedMemberId = await this.resolveAssignee(tenant, input.assignedMemberId, input.clientId);
    const task = await this.prisma.task.create({
      data: {
        organizationId: tenant.organizationId,
        clientId: input.clientId ?? null,
        assignedMemberId,
        createdById: tenant.userId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        priority: input.priority ?? "NORMAL",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });
    if (task.clientId) {
      await this.timeline.record({
        organizationId: tenant.organizationId,
        clientId: task.clientId,
        type: "TASK_CREATED",
        actorUserId: tenant.userId,
        targetType: "task",
        targetId: task.id,
        metadata: { title: task.title },
      });
    }
    await this.notifyAssignment(task);
    await this.security.record({
      type: "task_created",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async update(
    tenant: TenantContext,
    taskId: string,
    input: {
      title?: string;
      description?: string | null;
      clientId?: string | null;
      assignedMemberId?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueAt?: string | null;
    },
  ) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new BadRequestException("Completed or cancelled tasks cannot be edited");
    }
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    if (input.clientId) {
      await this.access.assertCanAccess(tenant, input.clientId, "manageRecords");
    }
    const assignedMemberId =
      input.assignedMemberId !== undefined
        ? await this.resolveAssignee(tenant, input.assignedMemberId ?? undefined, input.clientId ?? existing.clientId ?? undefined)
        : undefined;
    const previousAssignee = existing.assignedMemberId;
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title?.trim(),
        description: input.description === undefined ? undefined : input.description,
        clientId: input.clientId === undefined ? undefined : input.clientId,
        assignedMemberId,
        status: input.status,
        priority: input.priority,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });
    if (assignedMemberId && assignedMemberId !== previousAssignee) {
      await this.notifyAssignment(task);
    }
    await this.security.record({
      type: "task_updated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async complete(tenant: TenantContext, taskId: string) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });
    if (task.clientId) {
      await this.timeline.record({
        organizationId: tenant.organizationId,
        clientId: task.clientId,
        type: "TASK_COMPLETED",
        actorUserId: tenant.userId,
        targetType: "task",
        targetId: task.id,
        metadata: { title: task.title },
      });
    }
    await this.security.record({
      type: "task_completed",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async cancel(tenant: TenantContext, taskId: string) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "CANCELLED" },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });
    if (task.clientId) {
      await this.timeline.record({
        organizationId: tenant.organizationId,
        clientId: task.clientId,
        type: "TASK_CANCELLED",
        actorUserId: tenant.userId,
        targetType: "task",
        targetId: task.id,
        metadata: { title: task.title },
      });
    }
    await this.security.record({
      type: "task_cancelled",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async archive(tenant: TenantContext, taskId: string) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { archivedAt: new Date() },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });
    await this.security.record({
      type: "task_archived",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async createFromAutomation(input: {
    organizationId: string;
    createdById: string;
    clientId?: string;
    assignedMemberId?: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueAt?: string;
    automationRuleId: string;
    automationRunId: string;
  }) {
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({
        where: {
          id: input.clientId,
          organizationId: input.organizationId,
          status: "ACTIVE",
          archivedAt: null,
        },
      });
      if (!client) {
        throw new BadRequestException("Client is not available for automation");
      }
    }

    let assignedMemberId = input.assignedMemberId ?? null;
    if (!assignedMemberId && input.clientId) {
      const assignment = await this.prisma.clientAssignment.findFirst({
        where: {
          clientId: input.clientId,
          organizationId: input.organizationId,
          unassignedAt: null,
        },
      });
      assignedMemberId = assignment?.organizationMemberId ?? null;
    }
    if (!assignedMemberId) {
      const owner = await this.prisma.organizationMember.findFirst({
        where: { organizationId: input.organizationId, role: "OWNER", status: "ACTIVE" },
      });
      assignedMemberId = owner?.id ?? null;
    }
    if (!assignedMemberId) {
      throw new BadRequestException("No assignee available for automation task");
    }

    const task = await this.prisma.task.create({
      data: {
        organizationId: input.organizationId,
        clientId: input.clientId ?? null,
        assignedMemberId,
        createdById: input.createdById,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        priority: input.priority ?? "NORMAL",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });

    if (task.clientId) {
      await this.timeline.record({
        organizationId: input.organizationId,
        clientId: task.clientId,
        type: "TASK_CREATED",
        actorUserId: input.createdById,
        targetType: "task",
        targetId: task.id,
        metadata: {
          title: task.title,
          source: "automation",
          automationRuleId: input.automationRuleId,
          automationRunId: input.automationRunId,
        },
      });
    }

    await this.notifyAssignment(task);
    return this.toResponse(task);
  }

  private async findTask(tenant: TenantContext, taskId: string) {
    const visible = this.access.visibleWhere(tenant);
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: tenant.organizationId,
        archivedAt: null,
        OR: [{ clientId: null }, { client: visible }],
      },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        createdBy: true,
      },
    });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return task;
  }

  private async resolveAssignee(
    tenant: TenantContext,
    assignedMemberId: string | undefined,
    clientId: string | undefined,
  ): Promise<string | null> {
    if (!assignedMemberId) {
      return null;
    }
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: assignedMemberId, organizationId: tenant.organizationId, status: "ACTIVE" },
    });
    if (!member) {
      throw new BadRequestException("Assigned member is not available");
    }
    if (clientId && tenant.role !== "OWNER") {
      const assigned = await this.prisma.clientAssignment.findFirst({
        where: {
          clientId,
          organizationId: tenant.organizationId,
          organizationMemberId: assignedMemberId,
          unassignedAt: null,
        },
      });
      if (!assigned && member.id !== tenant.membershipId) {
        throw new BadRequestException("Assignee must be assigned to the client");
      }
    }
    return member.id;
  }

  private async notifyAssignment(task: {
    id: string;
    organizationId: string;
    clientId: string | null;
    title: string;
    assignedMember: { userId: string } | null;
  }) {
    if (!task.assignedMember) return;
    await this.notifications.create({
      organizationId: task.organizationId,
      userId: task.assignedMember.userId,
      clientId: task.clientId ?? undefined,
      type: "TASK_ASSIGNED",
      title: "Task assigned",
      body: task.title,
      targetType: "task",
      targetId: task.id,
    });
  }

  private toResponse(row: {
    id: string;
    organizationId: string;
    clientId: string | null;
    assignedMemberId: string | null;
    createdById: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    client?: { id: string; firstName: string; lastName: string; displayName: string | null } | null;
    assignedMember?: { id: string; user: { email: string } } | null;
    createdBy?: { email: string };
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      clientId: row.clientId,
      clientName: row.client
        ? row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`
        : null,
      assignedMemberId: row.assignedMemberId,
      assigneeEmail: row.assignedMember?.user.email ?? null,
      createdById: row.createdById,
      createdByEmail: row.createdBy?.email ?? null,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueAt: row.dueAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
