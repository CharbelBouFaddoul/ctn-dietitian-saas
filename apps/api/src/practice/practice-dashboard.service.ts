import { Injectable } from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientAccessService } from "../clients/client-access.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import { ConversationService } from "../messaging/conversation.service";
import { NotificationService } from "../notifications/notification.service";
import { tenantWhere } from "../dietitian/tenant-scope";

@Injectable()
export class PracticeDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly analytics: AnalyticsService,
    private readonly entitlements: EntitlementService,
    private readonly conversations: ConversationService,
    private readonly notifications: NotificationService,
  ) {}

  async get(tenant: DietitianTenantContext) {
    const visible = this.access.visibleWhere(tenant);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      overview,
      clientInsights,
      total,
      active,
      todayAppointments,
      upcomingAppointments,
      recentTimeline,
      myTasks,
      overdueTasks,
      visibleClients,
      clientLimitEntitlement,
    ] = await Promise.all([
      this.analytics.overview(tenant, { period: "this_month" }),
      this.analytics.clients(tenant, { period: "last_30_days" }),
      this.prisma.client.count({ where: visible }),
      this.prisma.client.count({ where: { ...visible, status: "ACTIVE" } }),
      this.prisma.appointment.findMany({
        where: {
          ...tenantWhere(tenant.dietitianAccountId),
          status: { in: ["SCHEDULED", "RESCHEDULE_PENDING", "CANCELLATION_PENDING"] },
          startAt: { gte: startOfToday, lte: endOfToday },
          client: visible,
        },
        include: { client: true },
        orderBy: { startAt: "asc" },
        take: 20,
      }),
      this.prisma.appointment.findMany({
        where: {
          ...tenantWhere(tenant.dietitianAccountId),
          status: { in: ["SCHEDULED", "RESCHEDULE_PENDING", "CANCELLATION_PENDING"] },
          startAt: { gt: endOfToday },
          client: visible,
        },
        include: { client: true },
        orderBy: { startAt: "asc" },
        take: 8,
      }),
      this.prisma.timelineEvent.findMany({
        where: { ...tenantWhere(tenant.dietitianAccountId), client: visible },
        include: { client: true },
        orderBy: { occurredAt: "desc" },
        take: 5,
      }),
      this.prisma.task.count({
        where: {
          ...tenantWhere(tenant.dietitianAccountId),
          archivedAt: null,
          assignedUserId: tenant.userId,
          status: { in: ["TODO", "IN_PROGRESS"] },
        },
      }),
      this.prisma.task.count({
        where: {
          ...tenantWhere(tenant.dietitianAccountId),
          archivedAt: null,
          assignedUserId: tenant.userId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueAt: { lt: now },
        },
      }),
      this.prisma.client.findMany({
        where: visible,
        select: { id: true },
      }),
      this.entitlements.resolve(tenant.dietitianAccountId, FEATURE_KEYS.CLIENT_LIMIT),
    ]);

    const inbox = await this.conversations.listInbox(
      tenant.dietitianAccountId,
      visibleClients.map((row) => row.id),
      tenant.userId,
    );
    const unreadMap = await this.conversations.unreadCountsForReader(
      tenant.userId,
      inbox.map((row) => row.id),
    );
    let unreadMessageCount = 0;
    for (const count of unreadMap.values()) {
      unreadMessageCount += count;
    }
    const topConversations = inbox.slice(0, 5);
    const [recentNotifications, unreadNotificationCount] = await Promise.all([
      this.notifications.listRecentPreferUnread(tenant.userId, tenant.dietitianAccountId, 5),
      this.notifications.unreadCount(tenant.userId, tenant.dietitianAccountId),
    ]);

    const mapAppointment = (row: (typeof todayAppointments)[number]) => ({
      id: row.id,
      title: row.title,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      clientId: row.client.id,
      clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
      clientEmail: row.client.email,
    });

    return {
      clientCount: total,
      clientLimit: clientLimitEntitlement.enabled ? clientLimitEntitlement.limit : null,
      activeClients: active,
      unreadMessageCount,
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
      todayAppointments: todayAppointments.map(mapAppointment),
      upcomingAppointments: upcomingAppointments.map(mapAppointment),
      recentConversations: topConversations.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        clientName: row.clientName,
        preview: row.lastMessagePreview,
        lastMessageAt: row.lastMessageAt,
        unreadCount: unreadMap.get(row.id) ?? 0,
      })),
      recentNotifications,
      unreadNotificationCount,
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
