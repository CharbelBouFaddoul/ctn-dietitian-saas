import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientAccessService } from "../clients/client-access.service";
import { AnalyticsService } from "../analytics/analytics.service";

@Injectable()
export class PracticeDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly analytics: AnalyticsService,
  ) {}

  async get(tenant: TenantContext) {
    const visible = this.access.visibleWhere(tenant);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [overview, clientInsights, total, active, upcomingAppointments, recentTimeline, myTasks, overdueTasks] =
      await Promise.all([
        this.analytics.overview(tenant, { period: "this_month" }),
        this.analytics.clients(tenant, { period: "last_30_days" }),
        this.prisma.client.count({ where: visible }),
        this.prisma.client.count({ where: { ...visible, status: "ACTIVE" } }),
        this.prisma.appointment.findMany({
          where: {
            organizationId: tenant.organizationId,
            status: "SCHEDULED",
            startAt: { gte: now },
            client: visible,
          },
          include: { client: true },
          orderBy: { startAt: "asc" },
          take: 8,
        }),
        this.prisma.timelineEvent.findMany({
          where: { organizationId: tenant.organizationId, client: visible },
          include: { client: true },
          orderBy: { occurredAt: "desc" },
          take: 10,
        }),
        this.prisma.task.count({
          where: {
            organizationId: tenant.organizationId,
            archivedAt: null,
            assignedMemberId: tenant.membershipId,
            status: { in: ["TODO", "IN_PROGRESS"] },
          },
        }),
        this.prisma.task.count({
          where: {
            organizationId: tenant.organizationId,
            archivedAt: null,
            assignedMemberId: tenant.membershipId,
            status: { in: ["TODO", "IN_PROGRESS"] },
            dueAt: { lt: now },
          },
        }),
      ]);

    return {
      clientCount: total,
      activeClients: active,
      newClientsThisMonth: overview.newClients,
      inactiveClients: overview.inactiveClients,
      tasksDueToday: overview.tasksDue,
      tasksOverdue: overview.tasksOverdue,
      myTasks,
      myOverdueTasks: overdueTasks,
      outstandingInvoices: overview.unpaidInvoices,
      overdueInvoices: overview.overdueInvoices,
      paidThisMonth: overview.paidAmount,
      invoicedThisMonth: overview.invoicedAmount,
      needsAttention: clientInsights.needsAttention.slice(0, 8),
      recentlyActive: clientInsights.recentlyActive.slice(0, 8),
      noRecentActivity: clientInsights.noRecentActivity.slice(0, 8),
      upcomingAppointments: upcomingAppointments.map((row) => ({
        id: row.id,
        title: row.title,
        startAt: row.startAt.toISOString(),
        clientId: row.client.id,
        clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
        clientEmail: row.client.email,
      })),
      recentActivity: recentTimeline.map((row) => ({
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt.toISOString(),
        clientId: row.client.id,
        clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
        clientEmail: row.client.email,
      })),
    };
  }
}
