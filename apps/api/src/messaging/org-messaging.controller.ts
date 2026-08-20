import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { SessionGuard } from "../auth/guards/session.guard";
import { ClientAccessService } from "../clients/client-access.service";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { ConversationService } from "./conversation.service";
import { MessagingRecipientService } from "./messaging-recipient.service";
import { MarkConversationReadDto, MessagePaginationQueryDto, SendMessageDto } from "./dto/messaging.dto";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("organizations")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class OrgMessagingController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly conversations: ConversationService,
    private readonly recipients: MessagingRecipientService,
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("conversations")
  @ApiOperation({ summary: "List conversations for visible clients" })
  async inbox(@CurrentTenant() tenant: DietitianTenantContext) {
    const clients = await this.prisma.client.findMany({
      where: this.access.visibleWhere(tenant),
      select: { id: true },
    });
    const rows = await this.conversations.listInbox(
      tenant.dietitianAccountId,
      clients.map((row) => row.id),
    );
    const unread = await this.conversations.unreadCountsForReader(
      tenant.userId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({ ...row, unreadCount: unread.get(row.id) ?? 0 }));
  }

  @Get("clients/:clientId/conversation")
  async getConversation(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const conversation = await this.conversations.getOrCreate(client);
    const unread = await this.conversations.unreadCount(conversation.id, tenant.userId);
    return {
      id: conversation.id,
      clientId: client.id,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: conversation.lastMessagePreview,
      unreadCount: unread,
    };
  }

  @Get("clients/:clientId/conversation/messages")
  async listMessages(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: MessagePaginationQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const conversation = await this.conversations.getOrCreate(client);
    return this.conversations.listMessages(
      conversation.id,
      requireDietitianAccountId(client),
      query.before,
      query.limit ?? 50,
    );
  }

  @Post("clients/:clientId/conversation/messages")
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.MESSAGING]: {} })
  async sendMessage(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: SendMessageDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const conversation = await this.conversations.getOrCreate(client);
    const clientUserId = await this.recipients.clientPortalUserId(client.id);
    const notifyUserIds = clientUserId ? [clientUserId] : [];
    return this.conversations.sendMessage({
      conversation,
      client,
      senderUserId: tenant.userId,
      body: body.body,
      notifyUserIds,
      senderIsClient: false,
    });
  }

  @Post("clients/:clientId/conversation/read")
  async markRead(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() _body: MarkConversationReadDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const conversation = await this.conversations.getOrCreate(client);
    return this.conversations.markRead(conversation.id, client, tenant.userId);
  }

  @Get("notifications")
  async listNotifications(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.notifications.listForUser(tenant.userId, tenant.dietitianAccountId);
  }

  @Get("notifications/unread-count")
  async unreadNotifications(@CurrentTenant() tenant: DietitianTenantContext) {
    const count = await this.notifications.unreadCount(tenant.userId, tenant.dietitianAccountId);
    return { count };
  }

  @Post("notifications/read-all")
  async markAllNotificationsRead(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.notifications.markAllRead(tenant.userId, tenant.dietitianAccountId);
  }

  @Patch("notifications/:notificationId/read")
  async markNotificationRead(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("notificationId", ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(tenant.userId, notificationId);
  }
}
