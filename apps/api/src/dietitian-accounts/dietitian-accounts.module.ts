import { Module } from "@nestjs/common";
import { DietitianAccountBackfillService } from "./dietitian-account-backfill.service";
import { DietitianAccountBootstrapService } from "./dietitian-account-bootstrap.service";

@Module({
  providers: [DietitianAccountBackfillService, DietitianAccountBootstrapService],
  exports: [DietitianAccountBackfillService],
})
export class DietitianAccountsModule {}
