import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RecipesModule } from "../recipes/recipes.module";
import { TimelineModule } from "../timeline/timeline.module";
import { MealPlanController } from "./meal-plan.controller";
import { MealPlanService } from "./meal-plan.service";
import { PortalMealPlanController } from "./portal-meal-plan.controller";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, RecipesModule, TimelineModule, NotificationsModule],
  controllers: [MealPlanController, PortalMealPlanController],
  providers: [MealPlanService],
  exports: [MealPlanService],
})
export class MealPlansModule {}
