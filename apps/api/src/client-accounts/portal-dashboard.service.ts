import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClientAccessService } from "../clients/client-access.service";
import { ClientAccountService } from "../client-accounts/client-account.service";
import { ConversationService } from "../messaging/conversation.service";
import { MealPlanService } from "../meal-plans/meal-plan.service";
import { NotificationService } from "../notifications/notification.service";
import { TrackingSummaryService } from "../tracking/tracking-summary.service";
import { requireDietitianAccountId, tenantWhere } from "../dietitian/tenant-scope";

@Injectable()
export class PortalDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly accounts: ClientAccountService,
    private readonly conversations: ConversationService,
    private readonly notifications: NotificationService,
    private readonly tracking: TrackingSummaryService,
    private readonly mealPlans: MealPlanService,
  ) {}

  async get(userId: string, activeClientId?: string | null) {
    const client = await this.access.assertPortalAccess(userId, { activeClientId });
    const dietitianAccountId = requireDietitianAccountId(client);
    const me = await this.accounts.portalMe(userId, client.id);

    const conversation = await this.conversations.getOrCreate(client);
    const [messages, unreadMessages, upcoming, recentNotifications, unreadNotificationCount, tracking, mealPlan] =
      await Promise.all([
        this.conversations.listMessages(conversation.id, dietitianAccountId, undefined, 5),
        this.conversations.unreadCount(conversation.id, userId),
        this.prisma.appointment.findFirst({
          where: {
            clientId: client.id,
            ...tenantWhere(dietitianAccountId),
            status: { in: ["SCHEDULED", "RESCHEDULE_PENDING"] },
            startAt: { gte: new Date() },
          },
          orderBy: { startAt: "asc" },
        }),
        this.notifications.listRecentPreferUnread(userId, dietitianAccountId, 5),
        this.notifications.unreadCount(userId, dietitianAccountId),
        this.tracking.dailySummary(client),
        this.mealPlans.portalCurrent(userId, client.id),
      ]);

    return {
      me,
      upcomingAppointment: upcoming
        ? {
            id: upcoming.id,
            title: upcoming.title,
            startAt: upcoming.startAt.toISOString(),
            endAt: upcoming.endAt.toISOString(),
            status: upcoming.status,
          }
        : null,
      messages: {
        preview: messages.map((row) => ({
          id: row.id,
          body: row.body,
          createdAt: row.createdAt,
          senderUserId: row.senderUserId,
        })),
        unreadCount: unreadMessages,
      },
      notifications: {
        recent: recentNotifications,
        unreadCount: unreadNotificationCount,
      },
      tracking,
      mealPlan: mealPlan.plan
        ? {
            name: mealPlan.plan.name,
            description: mealPlan.plan.description ?? null,
          }
        : null,
      quickLinks: [
        { href: "/client/plan", label: "My Plan" },
        { href: "/client/tracking", label: "Tracking" },
        { href: "/client/messages", label: "Messages" },
        { href: "/client/documents", label: "Documents" },
      ],
    };
  }
}
