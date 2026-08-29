import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientAccessService } from "./client-access.service";
import { ClientController } from "./client.controller";
import { ClientPortfolioService } from "./client-portfolio.service";
import { ClientPrintService } from "./client-print.service";
import { ClientService } from "./client.service";
import { ClientAccessGuard } from "./guards/client-access.guard";
import { TimelineController } from "../timeline/timeline.controller";

@Module({
  imports: [AuthModule, DietitianModule, EntitlementsModule, TimelineModule],
  controllers: [ClientController, TimelineController],
  providers: [ClientService, ClientPortfolioService, ClientPrintService, ClientAccessService, ClientAccessGuard],
  exports: [ClientService, ClientAccessService, ClientAccessGuard],
})
export class ClientsModule {}
