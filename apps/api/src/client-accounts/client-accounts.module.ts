import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { MealPlansModule } from "../meal-plans/meal-plans.module";
import { MessagingModule } from "../messaging/messaging.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { TrackingModule } from "../tracking/tracking.module";
import { ClientAccountController } from "./client-account.controller";
import { ClientAccountService } from "./client-account.service";
import { PortalController } from "./portal.controller";
import { PortalDashboardController } from "./portal-dashboard.controller";
import { PortalDashboardService } from "./portal-dashboard.service";
import { PracticeJoinCodeController } from "./practice-join-code.controller";

@Module({
  imports: [
    AuthModule,
    DietitianModule,
    ClientsModule,
    EntitlementsModule,
    TimelineModule,
    NotificationsModule,
    MessagingModule,
    MealPlansModule,
    TrackingModule,
  ],
  controllers: [
    ClientAccountController,
    PortalController,
    PortalDashboardController,
    PracticeJoinCodeController,
  ],
  providers: [ClientAccountService, PortalDashboardService],
  exports: [ClientAccountService],
})
export class ClientAccountsModule {}
