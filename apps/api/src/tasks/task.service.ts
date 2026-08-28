import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { ClientAccessService } from "../clients/client-access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { TimelineService } from "../timeline/timeline.service";
import { NotificationService } from "../notifications/notification.service";
import { tenantWhere } from "../dietitian/tenant-scope";

export type TaskView = "all" | "due_today" | "upcoming" | "overdue" | "completed";

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
    tenant: DietitianTenantContext,
    query: {
      view?: TaskView | "mine";
      status?: TaskStatus;
      priority?: TaskPriority;
      clientId?: string;
      assignedUserId?: string;
      search?: string;
      dueFrom?: string;
      dueTo?: string;
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

    // "mine" is accepted for backward compatibility but ignored — practice tasks
    // are clinic-scoped; assignment filtering uses assignedUserId when needed.
    const view = query.view === "mine" ? "all" : query.view;

    let dueFilter: Prisma.TaskWhereInput = {};
    if (view === "due_today") {
      dueFilter = { dueAt: { gte: startOfToday, lte: endOfToday }, status: { in: ["TODO", "IN_PROGRESS"] } };
    } else if (view === "upcoming") {
      dueFilter = { dueAt: { gt: endOfToday }, status: { in: ["TODO", "IN_PROGRESS"] } };
    } else if (view === "overdue") {
      dueFilter = { dueAt: { lt: new Date() }, status: { in: ["TODO", "IN_PROGRESS"] } };
    } else if (view === "completed") {
      dueFilter = { status: "COMPLETED" };
    }

    if (query.dueFrom || query.dueTo) {
      dueFilter = {
        ...dueFilter,
        dueAt: {
          ...(typeof dueFilter.dueAt === "object" && dueFilter.dueAt !== null ? dueFilter.dueAt : {}),
          ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
        },
      };
    }

    const search = query.search?.trim();
    const where: Prisma.TaskWhereInput = {
      ...tenantWhere(tenant.dietitianAccountId),
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
      ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          client: true,
          assignedUser: true,
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

  async listForClient(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.task.findMany({
      where: { ...tenantWhere(tenant.dietitianAccountId), clientId, archivedAt: null },
      include: {
        assignedUser: true,
        createdBy: true,
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(tenant: DietitianTenantContext, taskId: string) {
    const task = await this.findTask(tenant, taskId);
    return this.toResponse(task);
  }

  async create(
    tenant: DietitianTenantContext,
    input: {
      title: string;
      description?: string;
      clientId?: string;
      assignedUserId?: string;
      priority?: TaskPriority;
      dueAt?: string;
    },
  ) {
    if (input.clientId) {
      await this.access.assertCanAccess(tenant, input.clientId, "manageRecords");
    }
    const task = await this.prisma.task.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        clientId: input.clientId ?? null,
        assignedUserId: input.assignedUserId ?? tenant.userId,
        createdById: tenant.userId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        priority: input.priority ?? "NORMAL",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedUser: true,
        createdBy: true,
      },
    });
    if (task.clientId) {
      await this.timeline.record({
        dietitianAccountId: tenant.dietitianAccountId,
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
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async update(
    tenant: DietitianTenantContext,
    taskId: string,
    input: {
      title?: string;
      description?: string | null;
      clientId?: string | null;
      assignedUserId?: string | null;
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
    const previousAssignee = existing.assignedUserId;
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title?.trim(),
        description: input.description === undefined ? undefined : input.description,
        clientId: input.clientId === undefined ? undefined : input.clientId,
        assignedUserId: input.assignedUserId === undefined ? undefined : input.assignedUserId,
        status: input.status,
        priority: input.priority,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedUser: true,
        createdBy: true,
      },
    });
    if (input.assignedUserId !== undefined && task.assignedUserId !== previousAssignee) {
      await this.notifyAssignment(task);
    }
    await this.security.record({
      type: "task_updated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async complete(tenant: DietitianTenantContext, taskId: string) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: {
        client: true,
        assignedUser: true,
        createdBy: true,
      },
    });
    if (task.clientId) {
      await this.timeline.record({
        dietitianAccountId: tenant.dietitianAccountId,
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
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async cancel(tenant: DietitianTenantContext, taskId: string) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "CANCELLED" },
      include: {
        client: true,
        assignedUser: true,
        createdBy: true,
      },
    });
    if (task.clientId) {
      await this.timeline.record({
        dietitianAccountId: tenant.dietitianAccountId,
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
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async remove(tenant: DietitianTenantContext, taskId: string) {
    const existing = await this.findTask(tenant, taskId);
    if (existing.clientId) {
      await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    }
    await this.prisma.task.delete({ where: { id: taskId } });
    await this.security.record({
      type: "task_deleted",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "task",
      targetId: taskId,
    });
    return { id: taskId, deleted: true };
  }

  async createFromAutomation(input: {
    dietitianAccountId: string;
    createdById: string;
    clientId?: string;
    assignedUserId?: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueAt?: string;
    automationRuleId: string;
    automationRunId: string;
  }) {
    const account = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: input.dietitianAccountId },
    });
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({
        where: {
          id: input.clientId,
          dietitianAccountId: input.dietitianAccountId,
          status: "ACTIVE",
          archivedAt: null,
        },
      });
      if (!client) {
        throw new BadRequestException("Client is not available for automation");
      }
    }

    const assignedUserId = input.assignedUserId ?? account.userId;

    const task = await this.prisma.task.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: input.clientId ?? null,
        assignedUserId,
        createdById: input.createdById,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        priority: input.priority ?? "NORMAL",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedUser: true,
        createdBy: true,
      },
    });

    if (task.clientId) {
      await this.timeline.record({
        dietitianAccountId: input.dietitianAccountId,
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

  private async findTask(tenant: DietitianTenantContext, taskId: string) {
    const visible = this.access.visibleWhere(tenant);
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        ...tenantWhere(tenant.dietitianAccountId),
        archivedAt: null,
        OR: [{ clientId: null }, { client: visible }],
      },
      include: {
        client: true,
        assignedUser: true,
        createdBy: true,
      },
    });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return task;
  }

  private async notifyAssignment(task: {
    id: string;
    dietitianAccountId: string;
    clientId: string | null;
    title: string;
    assignedUserId: string | null;
  }) {
    if (!task.assignedUserId) return;
    await this.notifications.create({
      dietitianAccountId: task.dietitianAccountId,
      userId: task.assignedUserId,
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
    dietitianAccountId: string;
    clientId: string | null;
    assignedUserId: string | null;
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
    assignedUser?: { email: string } | null;
    createdBy?: { email: string };
  }) {
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client
        ? row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`
        : null,
      assignedUserId: row.assignedUserId,
      assigneeEmail: row.assignedUser?.email ?? null,
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
