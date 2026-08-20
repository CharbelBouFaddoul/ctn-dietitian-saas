import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DietitianAccountBackfillService } from "./dietitian-account-backfill.service";

/**
 * Phase 1: run idempotent DietitianAccount backfill once on API boot.
 * Safe to keep while legacy Organization rows still exist.
 */
@Injectable()
export class DietitianAccountBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DietitianAccountBootstrapService.name);

  constructor(private readonly backfill: DietitianAccountBackfillService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const summary = await this.backfill.run();
      this.logger.log(`DietitianAccount bootstrap backfill: ${JSON.stringify(summary)}`);
    } catch (error) {
      this.logger.error(
        `DietitianAccount bootstrap backfill failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
