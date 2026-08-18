import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { TimelineModule } from "../timeline/timeline.module";
import { ClientAccountController } from "./client-account.controller";
import { ClientAccountService } from "./client-account.service";
import { ClientInvitationController } from "./client-invitation.controller";
import { PortalController } from "./portal.controller";

@Module({
  imports: [AuthModule, EmailModule, OrganizationModule, ClientsModule, TimelineModule],
  controllers: [ClientAccountController, PortalController, ClientInvitationController],
  providers: [ClientAccountService],
  exports: [ClientAccountService],
})
export class ClientAccountsModule {}
