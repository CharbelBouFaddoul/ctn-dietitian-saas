import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { ClientProfileController } from "./client-profile.controller";
import { ClientProfileService } from "./client-profile.service";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule],
  controllers: [ClientProfileController],
  providers: [ClientProfileService],
})
export class ClientProfilesModule {}
