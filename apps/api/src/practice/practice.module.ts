import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { MessagingModule } from "../messaging/messaging.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PracticeController } from "./practice.controller";
import { PracticeDashboardService } from "./practice-dashboard.service";

@Module({
  imports: [
    AuthModule,
    OrganizationModule,
    ClientsModule,
    AnalyticsModule,
    MessagingModule,
    NotificationsModule,
  ],
  controllers: [PracticeController],
  providers: [PracticeDashboardService],
})
export class PracticeModule {}
