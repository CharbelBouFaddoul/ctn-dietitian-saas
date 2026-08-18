import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { TimelineModule } from "../timeline/timeline.module";
import { AssessmentController } from "./assessment.controller";
import { AssessmentService } from "./assessment.service";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule, TimelineModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentsModule {}
