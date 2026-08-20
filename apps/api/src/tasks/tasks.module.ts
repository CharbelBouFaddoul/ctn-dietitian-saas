import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaskService } from "./task.service";
import { ClientTasksController, TasksController } from "./tasks.controller";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, TimelineModule, NotificationsModule],
  controllers: [TasksController, ClientTasksController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TasksModule {}
