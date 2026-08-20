import { Injectable, Logger } from "@nestjs/common";

/**
 * Phase 7 completed the Organization → DietitianAccount migration and removed
 * Organization / OrganizationMember / dual-write columns. Historical backfill is
 * no longer runnable against the current schema; keep this provider as a no-op
 * so modules that still inject it compile and start cleanly.
 */
export type DietitianAccountBackfillSummary = {
  accountsCreated: number;
  accountsReused: number;
  settingsCreated: number;
  clientsUpdated: number;
  clientAccountsUpdated: number;
  orgAssetsUpdated: number;
  sequencesCopied: number;
  aiUsageCopied: number;
  automationUsageCopied: number;
  appointmentsRemapped: number;
  tasksRemapped: number;
  automationsRewritten: number;
  invitationsUpdated: number;
};

@Injectable()
export class DietitianAccountBackfillService {
  private readonly logger = new Logger(DietitianAccountBackfillService.name);

  async run(): Promise<DietitianAccountBackfillSummary> {
    this.logger.log(
      "DietitianAccount backfill skipped — Phase 7 removed Organization dual-write models; migration already applied.",
    );
    return {
      accountsCreated: 0,
      accountsReused: 0,
      settingsCreated: 0,
      clientsUpdated: 0,
      clientAccountsUpdated: 0,
      orgAssetsUpdated: 0,
      sequencesCopied: 0,
      aiUsageCopied: 0,
      automationUsageCopied: 0,
      appointmentsRemapped: 0,
      tasksRemapped: 0,
      automationsRewritten: 0,
      invitationsUpdated: 0,
    };
  }
}
