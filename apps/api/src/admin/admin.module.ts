import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { AiModule } from "../ai/ai.module";
import { AutomationModule } from "../automation/automation.module";
import { FoodsModule } from "../foods/foods.module";
import { OrganizationModule } from "../organizations/organization.module";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCatalogController } from "./admin-catalog.controller";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminFoodsController } from "./admin-foods.controller";
import { AdminListsController } from "./admin-lists.controller";
import { AdminMeController } from "./admin-me.controller";
import { AdminOrganizationsController } from "./admin-organizations.controller";
import { AdminOrganizationService } from "./admin-organization.service";
import { AdminOverrideService } from "./admin-override.service";
import { AdminSubscriptionService } from "./admin-subscription.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUserService } from "./admin-user.service";
import { AdminDietitiansController } from "./admin-dietitians.controller";
import { AdminDietitianService } from "./admin-dietitian.service";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@Module({
  imports: [AuthModule, OrganizationModule, EntitlementsModule, FoodsModule, AiModule, AutomationModule],
  controllers: [
    AdminMeController,
    AdminOrganizationsController,
    AdminUsersController,
    AdminDietitiansController,
    AdminCatalogController,
    AdminListsController,
    AdminFoodsController,
  ],
  providers: [
    PlatformRolesGuard,
    AdminOrganizationService,
    AdminSubscriptionService,
    AdminOverrideService,
    AdminUserService,
    AdminDietitianService,
    AdminCatalogService,
    AdminAuditService,
  ],
})
export class AdminModule {}
