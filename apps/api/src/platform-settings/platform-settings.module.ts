import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformRolesGuard } from "../admin/guards/platform-roles.guard";
import { AdminSiteSettingsController } from "./admin-site-settings.controller";
import { PlatformSettingsService } from "./platform-settings.service";
import { PublicSiteSettingsController } from "./public-site-settings.controller";

@Module({
  imports: [AuthModule],
  controllers: [PublicSiteSettingsController, AdminSiteSettingsController],
  providers: [PlatformSettingsService, PlatformRolesGuard],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
