import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConversationService } from "./conversation.service";
import { MessagingRecipientService } from "./messaging-recipient.service";
import { MessagingRealtimeService } from "./messaging-realtime.service";
import { MessagingGateway } from "./messaging.gateway";
import { DietitianMessagingController } from "./dietitian-messaging.controller";
import { PortalMessagingController, PortalNotificationController } from "./portal-messaging.controller";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, TimelineModule, NotificationsModule],
  controllers: [PortalMessagingController, PortalNotificationController, DietitianMessagingController],
  providers: [ConversationService, MessagingRecipientService, MessagingRealtimeService, MessagingGateway],
  exports: [ConversationService, MessagingRecipientService, MessagingRealtimeService],
})
export class MessagingModule {}
