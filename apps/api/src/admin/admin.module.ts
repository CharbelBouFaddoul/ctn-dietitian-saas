import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { AiModule } from "../ai/ai.module";
import { AutomationModule } from "../automation/automation.module";
import { FoodsModule } from "../foods/foods.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCatalogController } from "./admin-catalog.controller";
import { AdminCatalogService } from "./admin-catalog.service";
import { PublicPlansController } from "./public-plans.controller";
import { AdminFoodsController } from "./admin-foods.controller";
import { AdminListsController } from "./admin-lists.controller";
import { AdminMeController } from "./admin-me.controller";
import { AdminDietitiansManageController } from "./admin-dietitians-manage.controller";
import { AdminDietitianAccountService } from "./admin-dietitian-account.service";
import { AdminOverrideService } from "./admin-override.service";
import { AdminSubscriptionService } from "./admin-subscription.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUserService } from "./admin-user.service";
import { AdminDietitiansController } from "./admin-dietitians.controller";
import { AdminDietitianService } from "./admin-dietitian.service";
import { AdminPatientsController } from "./admin-patients.controller";
import { AdminPatientService } from "./admin-patient.service";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@Module({
  imports: [
    AuthModule,
    DietitianModule,
    EntitlementsModule,
    FoodsModule,
    AiModule,
    AutomationModule,
    NotificationsModule,
  ],
  controllers: [
    AdminMeController,
    AdminDietitiansManageController,
    AdminUsersController,
    AdminDietitiansController,
    AdminPatientsController,
    AdminCatalogController,
    PublicPlansController,
    AdminListsController,
    AdminFoodsController,
  ],
  providers: [
    PlatformRolesGuard,
    AdminDietitianAccountService,
    AdminSubscriptionService,
    AdminOverrideService,
    AdminUserService,
    AdminDietitianService,
    AdminPatientService,
    AdminCatalogService,
    AdminAuditService,
  ],
})
export class AdminModule {}
