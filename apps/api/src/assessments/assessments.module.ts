import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { AssessmentController } from "./assessment.controller";
import { AssessmentService } from "./assessment.service";
import { PortalAssessmentsController } from "./portal-assessments.controller";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, TimelineModule],
  controllers: [AssessmentController, PortalAssessmentsController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentsModule {}
