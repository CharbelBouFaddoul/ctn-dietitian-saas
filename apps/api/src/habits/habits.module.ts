import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { TrackingTimezoneService } from "../tracking/food-log.service";
import { HabitCatalogService } from "./habit-catalog.service";
import { PracticeHabitController } from "./practice-habit.controller";
import { ClientHabitAssignmentController } from "./client-habit-assignment.controller";
import { PortalHabitController } from "./portal-habit.controller";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, TimelineModule],
  controllers: [PracticeHabitController, ClientHabitAssignmentController, PortalHabitController],
  providers: [HabitCatalogService, TrackingTimezoneService],
  exports: [HabitCatalogService],
})
export class HabitsModule {}
