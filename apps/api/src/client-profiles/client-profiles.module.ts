import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { ClientProfileController } from "./client-profile.controller";
import { ClientProfileService } from "./client-profile.service";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule],
  controllers: [ClientProfileController],
  providers: [ClientProfileService],
})
export class ClientProfilesModule {}
