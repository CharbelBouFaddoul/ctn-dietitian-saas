import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { TimelineModule } from "../timeline/timeline.module";
import { AppointmentController } from "./appointment.controller";
import { AppointmentService } from "./appointment.service";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule, TimelineModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
})
export class AppointmentsModule {}
