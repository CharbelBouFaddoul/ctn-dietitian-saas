import { Module } from "@nestjs/common";
import { DietitianModule } from "../dietitian/dietitian.module";

/**
 * Compatibility shim — practice tenancy lives in DietitianModule.
 * Prefer importing DietitianModule directly in new code.
 */
@Module({
  imports: [DietitianModule],
  exports: [DietitianModule],
})
export class OrganizationModule {}
