import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientGoalController } from "./client-goal.controller";
import { ClientGoalService } from "./client-goal.service";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, TimelineModule],
  controllers: [ClientGoalController],
  providers: [ClientGoalService],
})
export class ClientGoalsModule {}
