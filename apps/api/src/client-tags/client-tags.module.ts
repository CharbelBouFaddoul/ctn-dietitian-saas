import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { ClientTagController } from "./client-tag.controller";
import { ClientTagService } from "./client-tag.service";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule],
  controllers: [ClientTagController],
  providers: [ClientTagService],
})
export class ClientTagsModule {}
