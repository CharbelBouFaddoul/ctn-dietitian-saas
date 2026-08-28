import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { localDateKey, parseLocalDate } from "@nutrition-saas/utilities";
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
    const { prevStart, prevEnd } = this.previousWindow(range);

    const [
      activeClients,
      newClients,
      inactiveClients,
      activeMealPlans,
      unpaidInvoices,
      overdueInvoices,
      tasksDue,
      tasksOverdue,
      current,
      previous,
      appointmentGroups,
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
      this.kpiMetrics(tenant, visible, range.start, range.end),
      this.kpiMetrics(tenant, visible, prevStart, prevEnd),
      this.prisma.appointment.groupBy({
        by: ["status"],
        where: {
          ...tenantWhere(tenant.dietitianAccountId),
          startAt: { gte: range.start, lte: range.end },
          client: visible,
        },
        _count: true,
      }),
    ]);

    const appointmentsByStatus = appointmentGroups
      .map((row) => ({ status: row.status, count: row._count }))
      .filter((row) => row.count > 0);
    const completed = appointmentsByStatus.find((row) => row.status === "COMPLETED")?.count ?? 0;
    const cancelled = appointmentsByStatus.find((row) => row.status === "CANCELLED")?.count ?? 0;
    const noShow = appointmentsByStatus.find((row) => row.status === "NO_SHOW")?.count ?? 0;
    const decided = completed + cancelled + noShow;
    const appointmentCompletionRate = decided > 0 ? completed / decided : null;

    const collectionRate =
      current.invoicedAmount > 0 ? current.paidAmount / current.invoicedAmount : null;
    const loggingCoverage = activeClients > 0 ? current.clientsLogged / activeClients : null;
    const prevCollectionRate =
      previous.invoicedAmount > 0 ? previous.paidAmount / previous.invoicedAmount : null;
    const prevLoggingCoverage = activeClients > 0 ? previous.clientsLogged / activeClients : null;

    return {
      period: range.period,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      timezone: range.timezone,
      activeClients,
      newClients,
      inactiveClients,
      activeMealPlans,
      appointments: current.appointments,
      appointmentsByStatus,
      appointmentCompletionRate,
      unpaidInvoices,
      overdueInvoices,
      invoicedAmount: current.invoicedAmount,
      paidAmount: current.paidAmount,
      tasksDue,
      tasksOverdue,
      collectionRate,
      loggingCoverage,
      activityVolume: current.activityVolume,
      clientsLogged: current.clientsLogged,
      previous: {
        collectionRate: prevCollectionRate,
        loggingCoverage: prevLoggingCoverage,
        appointments: previous.appointments,
        activityVolume: previous.activityVolume,
      },
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

    const [foodLogs, waterLogs, exerciseLogs, sleepLogs, habitLogs, foodIds, waterIds, exerciseIds, sleepIds, habitIds, activeClients] =
      await Promise.all([
        this.prisma.foodLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
        this.prisma.waterLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
        this.prisma.exerciseLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
        this.prisma.sleepLog.count({ where: { ...base, createdAt: { gte: range.start, lte: range.end } } }),
        this.prisma.habitLog.count({
          where: { ...base, logDate: { gte: this.toDateOnly(range.start), lte: this.toDateOnly(range.end) } },
        }),
        this.clientIdsFor(tenant, visible, "food", range.start, range.end),
        this.clientIdsFor(tenant, visible, "water", range.start, range.end),
        this.clientIdsFor(tenant, visible, "exercise", range.start, range.end),
        this.clientIdsFor(tenant, visible, "sleep", range.start, range.end),
        this.clientIdsFor(tenant, visible, "habit", range.start, range.end),
        this.prisma.client.count({ where: { ...visible, status: "ACTIVE" } }),
      ]);

    const uniqueLogged = new Set([...foodIds, ...waterIds, ...exerciseIds, ...sleepIds, ...habitIds]);

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
      clientsLogged: uniqueLogged.size,
      activeClients,
      byType: [
        { type: "food", logs: foodLogs, clients: foodIds.length },
        { type: "water", logs: waterLogs, clients: waterIds.length },
        { type: "exercise", logs: exerciseLogs, clients: exerciseIds.length },
        { type: "sleep", logs: sleepLogs, clients: sleepIds.length },
        { type: "habit", logs: habitLogs, clients: habitIds.length },
      ],
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

    const [outstanding, overdue, paidThisPeriod, invoicedThisPeriod, byStatus, outstandingGroups] =
      await Promise.all([
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
      this.prisma.invoice.groupBy({
        by: ["status"],
        where: { ...base, status: { in: ["ISSUED", "SENT", "OVERDUE"] } },
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
      outstandingByStatus: outstandingGroups
        .map((row) => ({
          status: row.status,
          count: row._count,
          total: Number(row._sum.total ?? 0),
        }))
        .filter((row) => row.total > 0),
    };
  }

  async series(
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
    const tz = settings.timezone;
    const visible = this.access.visibleWhere(tenant);
    const base = {
      ...tenantWhere(tenant.dietitianAccountId),
      client: visible,
    };

    const startKey = localDateKey(range.start, tz);
    const endKey = localDateKey(range.end, tz);
    const dayMs = 24 * 60 * 60 * 1000;
    const days: string[] = [];
    let cursor = parseLocalDate(startKey);
    const endDate = parseLocalDate(endKey);
    while (cursor.getTime() <= endDate.getTime()) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + dayMs);
    }
    const grain: "day" | "week" = days.length > 45 ? "week" : "day";
    const bucketKey = (dayKey: string) => (grain === "day" ? dayKey : this.mondayOf(dayKey));

    const order: string[] = [];
    const seen = new Set<string>();
    for (const day of days) {
      const key = bucketKey(day);
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
    const revenue = new Map(order.map((key) => [key, { invoiced: 0, paid: 0 }]));
    const activity = new Map(
      order.map((key) => [key, { foodLogs: 0, waterLogs: 0, exerciseLogs: 0, sleepLogs: 0, habitLogs: 0 }]),
    );

    const [invoiced, paid, food, water, exercise, sleep, habit] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          ...base,
          archivedAt: null,
          status: { not: "CANCELLED" },
          issueDate: { gte: this.toDateOnly(range.start), lte: this.toDateOnly(range.end) },
        },
        select: { issueDate: true, total: true },
      }),
      this.prisma.invoice.findMany({
        where: { ...base, archivedAt: null, status: "PAID", paidAt: { gte: range.start, lte: range.end } },
        select: { paidAt: true, total: true },
      }),
      this.prisma.foodLog.findMany({
        where: { ...base, createdAt: { gte: range.start, lte: range.end } },
        select: { createdAt: true },
      }),
      this.prisma.waterLog.findMany({
        where: { ...base, createdAt: { gte: range.start, lte: range.end } },
        select: { createdAt: true },
      }),
      this.prisma.exerciseLog.findMany({
        where: { ...base, createdAt: { gte: range.start, lte: range.end } },
        select: { createdAt: true },
      }),
      this.prisma.sleepLog.findMany({
        where: { ...base, createdAt: { gte: range.start, lte: range.end } },
        select: { createdAt: true },
      }),
      this.prisma.habitLog.findMany({
        where: { ...base, logDate: { gte: this.toDateOnly(range.start), lte: this.toDateOnly(range.end) } },
        select: { logDate: true },
      }),
    ]);

    for (const row of invoiced) {
      if (!row.issueDate) continue;
      const bucket = revenue.get(bucketKey(row.issueDate.toISOString().slice(0, 10)));
      if (bucket) bucket.invoiced += Number(row.total ?? 0);
    }
    for (const row of paid) {
      if (!row.paidAt) continue;
      const bucket = revenue.get(bucketKey(localDateKey(row.paidAt, tz)));
      if (bucket) bucket.paid += Number(row.total ?? 0);
    }
    for (const row of food) {
      const bucket = activity.get(bucketKey(localDateKey(row.createdAt, tz)));
      if (bucket) bucket.foodLogs += 1;
    }
    for (const row of water) {
      const bucket = activity.get(bucketKey(localDateKey(row.createdAt, tz)));
      if (bucket) bucket.waterLogs += 1;
    }
    for (const row of exercise) {
      const bucket = activity.get(bucketKey(localDateKey(row.createdAt, tz)));
      if (bucket) bucket.exerciseLogs += 1;
    }
    for (const row of sleep) {
      const bucket = activity.get(bucketKey(localDateKey(row.createdAt, tz)));
      if (bucket) bucket.sleepLogs += 1;
    }
    for (const row of habit) {
      if (!row.logDate) continue;
      const bucket = activity.get(bucketKey(row.logDate.toISOString().slice(0, 10)));
      if (bucket) bucket.habitLogs += 1;
    }

    return {
      period: range.period,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      timezone: tz,
      grain,
      revenue: order.map((at) => ({ at, ...revenue.get(at)! })),
      activity: order.map((at) => ({ at, ...activity.get(at)! })),
    };
  }

  private async requireSettings(dietitianAccountId: string) {
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
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

  /** Equal-length window immediately before `range.start`, for vs-prior deltas. */
  private previousWindow(range: { start: Date; end: Date }): { prevStart: Date; prevEnd: Date } {
    const span = range.end.getTime() - range.start.getTime();
    const prevEnd = new Date(range.start.getTime() - 1);
    const prevStart = new Date(range.start.getTime() - 1 - span);
    return { prevStart, prevEnd };
  }

  /** Monday (ISO week start) for a YYYY-MM-DD key, returned as YYYY-MM-DD. */
  private mondayOf(dayKey: string): string {
    const date = parseLocalDate(dayKey);
    const weekday = date.getUTCDay();
    const offset = weekday === 0 ? 6 : weekday - 1;
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
  }

  /** KPI inputs (revenue, appointments, tracking) for a single window. */
  private async kpiMetrics(
    tenant: DietitianTenantContext,
    visible: Prisma.ClientWhereInput,
    start: Date,
    end: Date,
  ): Promise<{
    invoicedAmount: number;
    paidAmount: number;
    appointments: number;
    activityVolume: number;
    clientsLogged: number;
  }> {
    const base = { ...tenantWhere(tenant.dietitianAccountId), client: visible };
    const [invoiced, paid, appointments, food, water, exercise, sleep, habit, clientsLogged] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: {
            ...base,
            archivedAt: null,
            status: { not: "CANCELLED" },
            issueDate: { gte: this.toDateOnly(start), lte: this.toDateOnly(end) },
          },
          _sum: { total: true },
        }),
        this.prisma.invoice.aggregate({
          where: { ...base, archivedAt: null, status: "PAID", paidAt: { gte: start, lte: end } },
          _sum: { total: true },
        }),
        this.prisma.appointment.count({ where: { ...base, startAt: { gte: start, lte: end } } }),
        this.prisma.foodLog.count({ where: { ...base, createdAt: { gte: start, lte: end } } }),
        this.prisma.waterLog.count({ where: { ...base, createdAt: { gte: start, lte: end } } }),
        this.prisma.exerciseLog.count({ where: { ...base, createdAt: { gte: start, lte: end } } }),
        this.prisma.sleepLog.count({ where: { ...base, createdAt: { gte: start, lte: end } } }),
        this.prisma.habitLog.count({
          where: { ...base, logDate: { gte: this.toDateOnly(start), lte: this.toDateOnly(end) } },
        }),
        this.clientsLoggedCount(tenant, visible, start, end),
      ]);
    return {
      invoicedAmount: Number(invoiced._sum.total ?? 0),
      paidAmount: Number(paid._sum.total ?? 0),
      appointments,
      activityVolume: food + water + exercise + sleep + habit,
      clientsLogged,
    };
  }

  /** Distinct clients with any tracking log in the window (for coverage). */
  private async clientsLoggedCount(
    tenant: DietitianTenantContext,
    visible: Prisma.ClientWhereInput,
    start: Date,
    end: Date,
  ): Promise<number> {
    const [food, water, exercise, sleep, habit] = await Promise.all([
      this.clientIdsFor(tenant, visible, "food", start, end),
      this.clientIdsFor(tenant, visible, "water", start, end),
      this.clientIdsFor(tenant, visible, "exercise", start, end),
      this.clientIdsFor(tenant, visible, "sleep", start, end),
      this.clientIdsFor(tenant, visible, "habit", start, end),
    ]);
    return new Set([...food, ...water, ...exercise, ...sleep, ...habit]).size;
  }

  private async clientIdsFor(
    tenant: DietitianTenantContext,
    visible: Prisma.ClientWhereInput,
    kind: "food" | "water" | "exercise" | "sleep" | "habit",
    start: Date,
    end: Date,
  ): Promise<string[]> {
    const base = { ...tenantWhere(tenant.dietitianAccountId), client: visible };
    if (kind === "habit") {
      const rows = await this.prisma.habitLog.findMany({
        where: { ...base, logDate: { gte: this.toDateOnly(start), lte: this.toDateOnly(end) } },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      return rows.map((row) => row.clientId);
    }
    const inWindow = { createdAt: { gte: start, lte: end } };
    if (kind === "food") {
      const rows = await this.prisma.foodLog.findMany({
        where: { ...base, ...inWindow },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      return rows.map((row) => row.clientId);
    }
    if (kind === "water") {
      const rows = await this.prisma.waterLog.findMany({
        where: { ...base, ...inWindow },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      return rows.map((row) => row.clientId);
    }
    if (kind === "exercise") {
      const rows = await this.prisma.exerciseLog.findMany({
        where: { ...base, ...inWindow },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      return rows.map((row) => row.clientId);
    }
    const rows = await this.prisma.sleepLog.findMany({
      where: { ...base, ...inWindow },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    return rows.map((row) => row.clientId);
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

  private async activeMealPlanByClient(dietitianAccountId: string, clientIds: string[]) {
    const rows = await this.prisma.mealPlan.findMany({
      where: { ...tenantWhere(dietitianAccountId), clientId: { in: clientIds }, status: "ACTIVE" },
      select: { clientId: true },
    });
    return new Set(rows.map((r) => r.clientId));
  }

  private async overdueInvoicesByClient(dietitianAccountId: string, clientIds: string[]) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        ...tenantWhere(dietitianAccountId),
        clientId: { in: clientIds },
        status: "OVERDUE",
        archivedAt: null,
      },
      select: { clientId: true },
    });
    return new Set(rows.map((r) => r.clientId));
  }

  private async overdueTasksByClient(dietitianAccountId: string, clientIds: string[]) {
    const rows = await this.prisma.task.findMany({
      where: {
        ...tenantWhere(dietitianAccountId),
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
