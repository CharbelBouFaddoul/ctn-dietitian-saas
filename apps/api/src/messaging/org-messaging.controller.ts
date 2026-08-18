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
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { ConversationService } from "./conversation.service";
import { MessagingRecipientService } from "./messaging-recipient.service";
import { MarkConversationReadDto, MessagePaginationQueryDto, SendMessageDto } from "./dto/messaging.dto";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("organizations")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId")
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
  async inbox(@CurrentTenant() tenant: TenantContext) {
    const clients = await this.prisma.client.findMany({
      where: this.access.visibleWhere(tenant),
      select: { id: true },
    });
    const rows = await this.conversations.listInbox(
      tenant.organizationId,
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
    @CurrentTenant() tenant: TenantContext,
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
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: MessagePaginationQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const conversation = await this.conversations.getOrCreate(client);
    return this.conversations.listMessages(
      conversation.id,
      client.organizationId,
      query.before,
      query.limit ?? 50,
    );
  }

  @Post("clients/:clientId/conversation/messages")
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.MESSAGING]: {} })
  async sendMessage(
    @CurrentTenant() tenant: TenantContext,
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
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() _body: MarkConversationReadDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const conversation = await this.conversations.getOrCreate(client);
    return this.conversations.markRead(conversation.id, client.organizationId, tenant.userId);
  }

  @Get("notifications")
  async listNotifications(@CurrentTenant() tenant: TenantContext) {
    return this.notifications.listForUser(tenant.userId, tenant.organizationId);
  }

  @Get("notifications/unread-count")
  async unreadNotifications(@CurrentTenant() tenant: TenantContext) {
    const count = await this.notifications.unreadCount(tenant.userId, tenant.organizationId);
    return { count };
  }

  @Patch("notifications/:notificationId/read")
  async markNotificationRead(
    @CurrentTenant() tenant: TenantContext,
    @Param("notificationId", ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(tenant.userId, notificationId);
  }
}
