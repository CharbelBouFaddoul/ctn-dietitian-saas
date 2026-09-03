import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { DietitianController } from "./dietitian.controller";
import { DietitianLifecycleService } from "./dietitian-lifecycle.service";
import { DietitianService } from "./dietitian.service";
import { DietitianGuard } from "./guards/dietitian.guard";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    EntitlementsModule,
    NotificationsModule,
    forwardRef(() => PlatformSettingsModule),
  ],
  controllers: [DietitianController],
  providers: [DietitianService, DietitianLifecycleService, DietitianGuard],
  exports: [DietitianService, DietitianLifecycleService, DietitianGuard],
})
export class DietitianModule {}
