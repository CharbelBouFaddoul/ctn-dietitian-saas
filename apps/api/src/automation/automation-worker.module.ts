import { Module } from "@nestjs/common";
import { AutomationModule } from "./automation.module";
import { AutomationQueueService } from "./automation-queue.service";

@Module({
  imports: [AutomationModule],
  providers: [AutomationQueueService],
})
export class AutomationWorkerModule {}
