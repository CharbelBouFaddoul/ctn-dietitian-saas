import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { OrganizationModule } from "../organizations/organization.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientAccountController } from "./client-account.controller";
import { ClientAccountService } from "./client-account.service";
import { PortalController } from "./portal.controller";
import { PracticeJoinCodeController } from "./practice-join-code.controller";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule, EntitlementsModule, TimelineModule],
  controllers: [ClientAccountController, PortalController, PracticeJoinCodeController],
  providers: [ClientAccountService],
  exports: [ClientAccountService],
})
export class ClientAccountsModule {}
