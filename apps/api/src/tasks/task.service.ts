import {
  BadRequestException,
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
import { legacyOrganizationId, tenantWhere } from "../organizations/tenant-scope";

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
      dueFilter = { assignedUserId: tenant.userId };
    }

    void query.assignedMemberId;

    const where: Prisma.TaskWhereInput = {
      ...tenantWhere(tenant.organizationId),
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
      // assignedMemberId query filter is intentionally ignored (Phase 2: ACL via assignedUserId only).
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
      where: { ...tenantWhere(tenant.organizationId), clientId, archivedAt: null },
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
    if (input.clientId) {
      await this.access.assertCanAccess(tenant, input.clientId, "manageRecords");
    }
    const task = await this.prisma.task.create({
      data: {
        dietitianAccountId: tenant.organizationId,
        organizationId: legacyOrganizationId(tenant),
        clientId: input.clientId ?? null,
        assignedMemberId: null,
        assignedUserId: tenant.userId,
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
        legacyOrganizationId: legacyOrganizationId(tenant),
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
      dietitianAccountId: tenant.organizationId,
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
      input.assignedMemberId !== undefined ? null : undefined;
    const previousAssignee = existing.assignedUserId;
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title?.trim(),
        description: input.description === undefined ? undefined : input.description,
        clientId: input.clientId === undefined ? undefined : input.clientId,
        assignedMemberId,
        assignedUserId: input.assignedMemberId !== undefined ? tenant.userId : undefined,
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
    if (input.assignedMemberId !== undefined && task.assignedUserId !== previousAssignee) {
      await this.notifyAssignment(task);
    }
    await this.security.record({
      type: "task_updated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
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
        legacyOrganizationId: legacyOrganizationId(tenant),
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
      dietitianAccountId: tenant.organizationId,
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
        legacyOrganizationId: legacyOrganizationId(tenant),
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
      dietitianAccountId: tenant.organizationId,
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
      dietitianAccountId: tenant.organizationId,
      targetType: "task",
      targetId: task.id,
    });
    return this.toResponse(task);
  }

  async createFromAutomation(input: {
    organizationId: string;
    createdById: string;
    clientId?: string;
    assignedUserId?: string;
    assignedMemberId?: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueAt?: string;
    automationRuleId: string;
    automationRunId: string;
  }) {
    const dietitianAccountId = input.organizationId;
    const account = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: dietitianAccountId },
    });
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({
        where: {
          id: input.clientId,
          dietitianAccountId,
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
        dietitianAccountId,
        organizationId: account.legacyOrganizationId ?? dietitianAccountId,
        clientId: input.clientId ?? null,
        assignedMemberId: null,
        assignedUserId,
        createdById: input.createdById,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        priority: input.priority ?? "NORMAL",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
      include: {
        client: true,
        assignedMember: { include: { user: true } },
        assignedUser: true,
        createdBy: true,
      },
    });

    if (task.clientId) {
      await this.timeline.record({
        organizationId: dietitianAccountId,
        legacyOrganizationId: account.legacyOrganizationId ?? dietitianAccountId,
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
        ...tenantWhere(tenant.organizationId),
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

  private async notifyAssignment(task: {
    id: string;
    organizationId: string;
    dietitianAccountId?: string | null;
    clientId: string | null;
    title: string;
    assignedMember: { userId: string } | null;
    assignedUserId?: string | null;
  }) {
    const userId = task.assignedUserId ?? task.assignedMember?.userId;
    if (!userId) return;
    await this.notifications.create({
      organizationId: task.dietitianAccountId ?? task.organizationId,
      legacyOrganizationId: task.organizationId,
      userId,
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
    dietitianAccountId?: string | null;
    clientId: string | null;
    assignedMemberId: string | null;
    assignedUserId?: string | null;
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
      organizationId: row.dietitianAccountId ?? row.organizationId,
      clientId: row.clientId,
      clientName: row.client
        ? row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`
        : null,
      assignedMemberId: row.assignedMemberId,
      assignedUserId: row.assignedUserId ?? null,
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
