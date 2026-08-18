import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { TimelineModule } from "../timeline/timeline.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConversationService } from "./conversation.service";
import { MessagingRecipientService } from "./messaging-recipient.service";
import { OrgMessagingController } from "./org-messaging.controller";
import { PortalMessagingController, PortalNotificationController } from "./portal-messaging.controller";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule, TimelineModule, NotificationsModule],
  controllers: [PortalMessagingController, PortalNotificationController, OrgMessagingController],
  providers: [ConversationService, MessagingRecipientService],
  exports: [ConversationService, MessagingRecipientService],
})
export class MessagingModule {}
