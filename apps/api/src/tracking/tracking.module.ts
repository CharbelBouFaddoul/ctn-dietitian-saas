import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { FoodsModule } from "../foods/foods.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientTrackingController } from "./client-tracking.controller";
import { FoodLogNutritionService } from "./food-log-nutrition.service";
import { FoodLogService, TrackingTimezoneService } from "./food-log.service";
import { PortalTrackingController } from "./portal-tracking.controller";
import { TrackingSummaryService } from "./tracking-summary.service";
import {
  ExerciseLogService,
  HabitLogService,
  SleepLogService,
  WaterLogService,
} from "./water-exercise-sleep-habit.service";
import { PlannedMealLogService } from "./planned-meal-log.service";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, FoodsModule, TimelineModule],
  controllers: [PortalTrackingController, ClientTrackingController],
  providers: [
    TrackingTimezoneService,
    FoodLogNutritionService,
    FoodLogService,
    WaterLogService,
    ExerciseLogService,
    SleepLogService,
    HabitLogService,
    TrackingSummaryService,
    PlannedMealLogService,
  ],
  exports: [TrackingSummaryService, FoodLogService],
})
export class TrackingModule {}
