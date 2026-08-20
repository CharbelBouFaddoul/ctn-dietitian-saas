import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientMeasurementController } from "./client-measurement.controller";
import { ClientMeasurementService } from "./client-measurement.service";
import { PortalEvolutionController } from "./portal-evolution.controller";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, TimelineModule],
  controllers: [ClientMeasurementController, PortalEvolutionController],
  providers: [ClientMeasurementService],
  exports: [ClientMeasurementService],
})
export class ClientMeasurementsModule {}
