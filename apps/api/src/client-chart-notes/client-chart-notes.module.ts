import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { ClientChartNoteController } from "./client-chart-note.controller";
import { ClientChartNoteService } from "./client-chart-note.service";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule],
  controllers: [ClientChartNoteController],
  providers: [ClientChartNoteService],
})
export class ClientChartNotesModule {}
