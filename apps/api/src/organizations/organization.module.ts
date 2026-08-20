import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationController } from "./organization.controller";
import { OrganizationLifecycleService } from "./organization-lifecycle.service";
import { OrganizationService } from "./organization.service";
import { MembershipService } from "./membership.service";
import { TenantGuard } from "./guards/tenant.guard";

@Module({
  imports: [AuthModule, EntitlementsModule, NotificationsModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    MembershipService,
    OrganizationLifecycleService,
    TenantGuard,
  ],
  exports: [
    OrganizationService,
    MembershipService,
    OrganizationLifecycleService,
    TenantGuard,
  ],
})
export class OrganizationModule {}
