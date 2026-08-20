import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { ConversationService } from "./conversation.service";
import { MessagingRecipientService } from "./messaging-recipient.service";
import { NotificationService } from "../notifications/notification.service";
import { MarkConversationReadDto, MessagePaginationQueryDto, SendMessageDto } from "./dto/messaging.dto";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/conversation")
export class PortalMessagingController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly conversations: ConversationService,
    private readonly recipients: MessagingRecipientService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the signed-in client's conversation" })
  async getConversation(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    const conversation = await this.conversations.getOrCreate(client);
    const unread = await this.conversations.unreadCount(conversation.id, user.id);
    return {
      id: conversation.id,
      clientId: client.id,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: conversation.lastMessagePreview,
      unreadCount: unread,
    };
  }

  @Get("messages")
  async listMessages(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: MessagePaginationQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    const conversation = await this.conversations.getOrCreate(client);
    return this.conversations.listMessages(
      conversation.id,
      requireDietitianAccountId(client),
      query.before,
      query.limit ?? 50,
    );
  }

  @Post("messages")
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.MESSAGING]: {} })
  async sendMessage(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() body: SendMessageDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    const conversation = await this.conversations.getOrCreate(client);
    const notifyUserIds = await this.recipients.assignedMemberUserIds(
      requireDietitianAccountId(client),
      client.id,
    );
    return this.conversations.sendMessage({
      conversation,
      client,
      senderUserId: user.id,
      body: body.body,
      notifyUserIds,
      senderIsClient: true,
    });
  }

  @Post("read")
  async markRead(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() _body: MarkConversationReadDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    const conversation = await this.conversations.getOrCreate(client);
    return this.conversations.markRead(conversation.id, client, user.id);
  }
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/notifications")
export class PortalNotificationController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.notifications.listForUser(user.id, requireDietitianAccountId(client));
  }

  @Get("unread-count")
  async unread(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    const count = await this.notifications.unreadCount(user.id, requireDietitianAccountId(client));
    return { count };
  }

  @Post("read-all")
  async markAllRead(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.notifications.markAllRead(user.id, requireDietitianAccountId(client));
  }

  @Patch(":notificationId/read")
  async markRead(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("notificationId", ParseUUIDPipe) notificationId: string,
  ) {
    await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.notifications.markRead(user.id, notificationId);
  }
}
