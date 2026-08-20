import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MessagingModule } from "../messaging/messaging.module";
import { DocumentService } from "./document.service";
import { ClientDocumentsController, PortalDocumentsController } from "./documents.controller";

@Module({
  imports: [
    AuthModule,
    DietitianModule,
    ClientsModule,
    TimelineModule,
    NotificationsModule,
    MessagingModule,
  ],
  controllers: [PortalDocumentsController, ClientDocumentsController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
