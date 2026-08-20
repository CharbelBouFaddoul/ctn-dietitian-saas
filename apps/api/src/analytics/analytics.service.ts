import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { localDateKey } from "@nutrition-saas/utilities";
import { ClientAccessService } from "../clients/client-access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { AnalyticsPeriod, resolveAnalyticsRange } from "./analytics-range";
import { tenantWhere } from "../dietitian/tenant-scope";

const INACTIVE_DAYS = 14;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
  ) {}

  async overview(
    tenant: DietitianTenantContext,
    input: { period?: AnalyticsPeriod; startDate?: string; endDate?: string },
  ) {
    const settings = await this.requireSettings(tenant.dietitianAccountId);
    const range = resolveAnalyticsRange({
      period: input.period,
      timezone: settings.timezone,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const visible = this.access.visibleWhere(tenant);
    const now = new Date();

    const [
      activeClients,
      newClients,
      inactiveClients,
      activeMealPlans,
      appointments,
      unpaidInvoices,
      overdueInvoices,
      invoicedAmount,
      paidAmount,
      tasksDue,
      tasksOverdue,
    ] = await Promise.all([
      this.prisma.client.count({ where: { ...visible, status: "ACTIVE" } }),
      this.prisma.client.count({
        where: { ...visible, createdAt: { gte: range.start, lte: range.end } },
      }),
      this.prisma.client.count({
        where: { ...visible, status: { in: ["INACTIVE", "ARCHIVED"] } },
      }),
      this.prisma.mealPlan.count({
        where: { ...tenantWhere(tenant.dietitianAccountId),
          status: "ACTIVE",
          client: visible,
        },
      }),
      this.prisma.appointment.count({
        where: { ...tenantWhere(tenant.dietitianAccountId),
          startAt: { gte: range.start, lte: range.end },
          client: visible,
        },
      }),
      this.prisma.invoice.count({
        where: { ...tenantWhere(tenant.dietitianAccountId),
          archivedAt: null,
          status: { in: ["ISSUED", "SENT", "OVERDUE"] },
          client: visible,
        },
      }),
      this.prisma.invoice.count({
        where: { ...tenantWhere(tenant.dietitianAccountId),
          archivedAt: null,
          status: "OVERDUE",
          client: visible,
        },
      }),
      this.prisma.invoice.aggregate({
        where: { ...tenantWhere(tenant.dietitianAccountId),
          archivedAt: null,
          issueDate: { gte: this.toDateOnly(range.start), lte: this.toDateOnly(range.end) },
          status: { not: "CANCELLED" },
          client: visible,
        },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...tenantWhere(tenant.dietitianAccountId),
          archivedAt: null,
          paidAt: { gte: range.start, lte: range.end },
          status: "PAID",
          client: visible,
        },
        _sum: { total: true },
      }),
      this.prisma.task.count({
        where: this.taskVisibleWhere(tenant, visible, {
          dueAt: { gte: now, lte: this.endOfDay(now) },
          status: { in: ["TODO", "IN_PROGRESS"] },
        }),
      }),
      this.prisma.task.count({
        where: this.taskVisibleWhere(tenant, visible, {
          dueAt: { lt: now },
          status: { in: ["TODO", "IN_PROGRESS"] },
        }),
      }),
    ]);

    return {
      period: range.period,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      timezone: range.timezone,
      activeClients,
      newClients,
      inactiveClients,
      activeMealPlans,
      appointments,
      unpaidInvoices,
      overdueInvoices,
      invoicedAmount: Number(invoicedAmount._sum.total ?? 0),
      paidAmount: Number(paidAmount._sum.total ?? 0),
      tasksDue,
      tasksOverdue,
    };
  }

  async clients(
    tenant: DietitianTenantContext,
    input: { period?: AnalyticsPeriod; startDate?: string; endDate?: string },
  ) {
    const settings = await this.requireSettings(tenant.dietitianAccountId);
    const range = resolveAnalyticsRange({
      period: input.period,
      timezone: settings.timezone,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const visible = this.access.visibleWhere(tenant);
    const clients = await this.prisma.client.findMany({
      where: { ...visible, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
    });
    const clientIds = clients.map((c) => c.id);
    if (!clientIds.length) {
      return { needsAttention: [], recentlyActive: [], noRecentActivity: [] };
    }

    const [food, water, exercise, sleep, habits, messages, mealPlans, overdueInvoices, overdueTasks] =
      await Promise.all([
        this.latestByClient("foodLog", tenant.dietitianAccountId, clientIds, range),
        this.latestByClient("waterLog", tenant.dietitianAccountId, clientIds, range),
        this.latestByClient("exerciseLog", tenant.dietitianAccountId, clientIds, range),
        this.latestByClient("sleepLog", tenant.dietitianAccountId, clientIds, range),
        this.latestByClient("habitLog", tenant.dietitianAccountId, clientIds, range),
        this.latestByClient("message", tenant.dietitianAccountId, clientIds, range),
        this.activeMealPlanByClient(tenant.dietitianAccountId, clientIds),
        this.overdueInvoicesByClient(tenant.dietitianAccountId, clientIds),
        this.overdueTasksByClient(tenant.dietitianAccountId, clientIds),
      ]);

    const todayKey = localDateKey(new Date(), settings.timezone);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - INACTIVE_DAYS);

    const recentlyActive: Array<{
      clientId: string;
      clientName: string;
      clientEmail: string | null;
      lastActivityAt: string;
    }> = [];
    const noRecentActivity: Array<{
      clientId: string;
      clientName: string;
      clientEmail: string | null;
      lastActivityAt: string | null;
      reason: string;
    }> = [];
    const needsAttention: Array<{
      clientId: string;
      clientName: string;
      clientEmail: string | null;
      reasons: string[];
    }> = [];

    for (const client of clients) {
      const name = client.displayName ?? `${client.firstName} ${client.lastName}`;
      const activityDates = [
        food.get(client.id),
        water.get(client.id),
        exercise.get(client.id),
        sleep.get(client.id),
        habits.get(client.id),
        messages.get(client.id),
      ].filter(Boolean) as Date[];
      const lastActivity = activityDates.length
        ? new Date(Math.max(...activityDates.map((d) => d.getTime())))
        : null;

      if (lastActivity && lastActivity >= range.start) {
        recentlyActive.push({
          clientId: client.id,
          clientName: name,
          clientEmail: client.email,
          lastActivityAt: lastActivity.toISOString(),
        });
      }

      const reasons: string[] = [];
      if (!lastActivity || lastActivity < cutoff) {
        const daysAgo = lastActivity
          ? Math.floor((Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        reasons.push(
          daysAgo === null
            ? "No tracking activity recorded"
            : `Last tracking activity: ${daysAgo} days ago`,
        );
        noRecentActivity.push({
          clientId: client.id,
          clientName: name,
          clientEmail: client.email,
          lastActivityAt: lastActivity?.toISOString() ?? null,
          reason: reasons[0] ?? "Needs attention",
        });
      }
      if (!mealPlans.has(client.id)) {
        reasons.push("No active meal plan");
      }
      if (overdueInvoices.has(client.id)) {
        reasons.push("Overdue invoice");
      }
      if (overdueTasks.has(client.id)) {
        reasons.push("Overdue task");
      }
      if (reasons.length) {
        needsAttention.push({ clientId: client.id, clientName: name, clientEmail: client.email, reasons });
      }
    }

    return {
      period: range.period,
      timezone: settings.timezone,
      recentlyActive: recentlyActive.slice(0, 20),
      noRecentActivity: noRecentActivity.slice(0, 20),
      needsAttention: needsAttention.slice(0, 20),
      withRecentMessages: [...messages.entries()]
        .filter(([, date]) => date >= range.start)
        .map(([clientId]) => {
          const client = clients.find((c) => c.id === clientId)!;
          return {
            clientId,
            clientName: client.displayName ?? `${client.firstName} ${client.lastName}`,
          };
        }),
      withRecentMealPlanActivity: Array.from(mealPlans).map((clientId) => {
        const client = clients.find((c) => c.id === clientId)!;
        return {
          clientId,
          clientName: client.displayName ?? `${client.firstName} ${client.lastName}`,
        };
      }),
      asOf: todayKey,
    };
  }

  async activity(
    tenant: DietitianTenantContext,
    input: { period?: AnalyticsPeriod; startDate?: string; endDate?: string },
  ) {
    const settings = await this.requireSettings(tenant.dietitianAccountId);
    const range = resolveAnalyticsRange({
      period: input.period,
      timezone: settings.timezone,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const visible = this.access.visibleWhere(tenant);
    const base = {
      ...tenantWhere(tenant.dietitianAccountId),
      client: visible,
    };

    const [foodLogs, waterLogs, exerciseLogs, sleepLogs, habitLogs] = await Promise.all([
      this.prisma.foodLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
      this.prisma.waterLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
      this.prisma.exerciseLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
      this.prisma.sleepLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
      this.prisma.habitLog.count({
        where: { ...base, logDate: { gte: this.toDateOnly(range.start), lte: this.toDateOnly(range.end) } },
      }),
    ]);

    return {
      period: range.period,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      timezone: settings.timezone,
      foodLogs,
      waterLogs,
      exerciseLogs,
      sleepLogs,
      habitLogs,
    };
  }

  async financial(
    tenant: DietitianTenantContext,
    input: { period?: AnalyticsPeriod; startDate?: string; endDate?: string },
  ) {
    const settings = await this.requireSettings(tenant.dietitianAccountId);
    const range = resolveAnalyticsRange({
      period: input.period,
      timezone: settings.timezone,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const visible = this.access.visibleWhere(tenant);
    const base: Prisma.InvoiceWhereInput = {
      ...tenantWhere(tenant.dietitianAccountId),
      archivedAt: null,
      client: visible,
    };

    const [outstanding, overdue, paidThisPeriod, invoicedThisPeriod, byStatus] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { ...base, status: { in: ["ISSUED", "SENT", "OVERDUE"] } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { ...base, status: "OVERDUE" },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { ...base, status: "PAID", paidAt: { gte: range.start, lte: range.end } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: {
          ...base,
          status: { not: "CANCELLED" },
          issueDate: { gte: this.toDateOnly(range.start), lte: this.toDateOnly(range.end) },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.invoice.groupBy({
        by: ["status"],
        where: base,
        _sum: { total: true },
        _count: true,
      }),
    ]);

    return {
      period: range.period,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      timezone: settings.timezone,
      currency: settings.currency,
      outstanding: {
        count: outstanding._count,
        total: Number(outstanding._sum.total ?? 0),
      },
      overdue: {
        count: overdue._count,
        total: Number(overdue._sum.total ?? 0),
      },
      paidThisPeriod: {
        count: paidThisPeriod._count,
        total: Number(paidThisPeriod._sum.total ?? 0),
      },
      invoicedThisPeriod: {
        count: invoicedThisPeriod._count,
        total: Number(invoicedThisPeriod._sum.total ?? 0),
      },
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count,
        total: Number(row._sum.total ?? 0),
      })),
    };
  }

  private async requireSettings(organizationId: string) {
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId: organizationId },
    });
    return settings ?? { timezone: "UTC", currency: "USD" };
  }

  private taskVisibleWhere(
    tenant: DietitianTenantContext,
    visible: Prisma.ClientWhereInput,
    extra: Prisma.TaskWhereInput,
  ): Prisma.TaskWhereInput {
    return {
      ...tenantWhere(tenant.dietitianAccountId),
      archivedAt: null,
      AND: [{ OR: [{ clientId: null }, { client: visible }] }, extra],
    };
  }

  private endOfDay(date: Date): Date {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private toDateOnly(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private async latestByClient(
    kind: "foodLog" | "waterLog" | "exerciseLog" | "sleepLog" | "habitLog" | "message",
    dietitianAccountId: string,
    clientIds: string[],
    range: { start: Date; end: Date },
  ): Promise<Map<string, Date>> {
    const map = new Map<string, Date>();
    const scope = tenantWhere(dietitianAccountId);
    if (kind === "foodLog") {
      const rows = await this.prisma.foodLog.groupBy({
        by: ["clientId"],
        where: { ...scope, clientId: { in: clientIds }, createdAt: { lte: range.end } },
        _max: { createdAt: true },
      });
      for (const row of rows) {
        if (row._max.createdAt) map.set(row.clientId, row._max.createdAt);
      }
    } else if (kind === "waterLog") {
      const rows = await this.prisma.waterLog.groupBy({
        by: ["clientId"],
        where: { ...scope, clientId: { in: clientIds }, createdAt: { lte: range.end } },
        _max: { createdAt: true },
      });
      for (const row of rows) map.set(row.clientId, row._max.createdAt!);
    } else if (kind === "exerciseLog") {
      const rows = await this.prisma.exerciseLog.groupBy({
        by: ["clientId"],
        where: { ...scope, clientId: { in: clientIds }, createdAt: { lte: range.end } },
        _max: { createdAt: true },
      });
      for (const row of rows) map.set(row.clientId, row._max.createdAt!);
    } else if (kind === "sleepLog") {
      const rows = await this.prisma.sleepLog.groupBy({
        by: ["clientId"],
        where: { ...scope, clientId: { in: clientIds }, createdAt: { lte: range.end } },
        _max: { createdAt: true },
      });
      for (const row of rows) map.set(row.clientId, row._max.createdAt!);
    } else if (kind === "habitLog") {
      const rows = await this.prisma.habitLog.groupBy({
        by: ["clientId"],
        where: { ...scope, clientId: { in: clientIds } },
        _max: { createdAt: true },
      });
      for (const row of rows) map.set(row.clientId, row._max.createdAt!);
    } else {
      const rows = await this.prisma.message.groupBy({
        by: ["clientId"],
        where: { ...scope, clientId: { in: clientIds }, createdAt: { lte: range.end } },
        _max: { createdAt: true },
      });
      for (const row of rows) map.set(row.clientId, row._max.createdAt!);
    }
    return map;
  }

  private async activeMealPlanByClient(organizationId: string, clientIds: string[]) {
    const rows = await this.prisma.mealPlan.findMany({
      where: { ...tenantWhere(organizationId), clientId: { in: clientIds }, status: "ACTIVE" },
      select: { clientId: true },
    });
    return new Set(rows.map((r) => r.clientId));
  }

  private async overdueInvoicesByClient(organizationId: string, clientIds: string[]) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        ...tenantWhere(organizationId),
        clientId: { in: clientIds },
        status: "OVERDUE",
        archivedAt: null,
      },
      select: { clientId: true },
    });
    return new Set(rows.map((r) => r.clientId));
  }

  private async overdueTasksByClient(organizationId: string, clientIds: string[]) {
    const rows = await this.prisma.task.findMany({
      where: {
        ...tenantWhere(organizationId),
        clientId: { in: clientIds },
        archivedAt: null,
        status: { in: ["TODO", "IN_PROGRESS"] },
        dueAt: { lt: new Date() },
      },
      select: { clientId: true },
    });
    return new Set(rows.map((r) => r.clientId).filter(Boolean) as string[]);
  }
}
