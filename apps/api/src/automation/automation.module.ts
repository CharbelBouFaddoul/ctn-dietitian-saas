import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { MessagingModule } from "../messaging/messaging.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { TasksModule } from "../tasks/tasks.module";
import { AutomationEvaluatorService } from "./automation-evaluator.service";
import { AutomationExecutorService } from "./automation-executor.service";
import { AutomationSweepService } from "./automation-sweep.service";
import { AutomationTemplateService } from "./automation-template.service";
import { AutomationUsageService } from "./automation-usage.service";
import { AutomationRunsController, AutomationsController } from "./automation.controller";
import { AutomationService } from "./automation.service";

@Module({
  imports: [
    AuthModule,
    DietitianModule,
    EntitlementsModule,
    NotificationsModule,
    EmailModule,
    TasksModule,
    MessagingModule,
    PlatformSettingsModule,
  ],
  controllers: [AutomationsController, AutomationRunsController],
  providers: [
    AutomationService,
    AutomationTemplateService,
    AutomationUsageService,
    AutomationEvaluatorService,
    AutomationExecutorService,
    AutomationSweepService,
  ],
  exports: [AutomationService, AutomationSweepService, AutomationExecutorService, AutomationUsageService],
})
export class AutomationModule {}
