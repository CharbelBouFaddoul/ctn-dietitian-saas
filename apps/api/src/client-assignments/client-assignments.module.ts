import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientAssignmentController } from "./client-assignment.controller";
import { ClientAssignmentService } from "./client-assignment.service";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule, TimelineModule],
  controllers: [ClientAssignmentController],
  providers: [ClientAssignmentService],
  exports: [ClientAssignmentService],
})
export class ClientAssignmentsModule {}
