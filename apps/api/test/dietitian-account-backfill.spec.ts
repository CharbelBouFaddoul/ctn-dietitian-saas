import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DietitianAccountBackfillService } from "../src/dietitian-accounts/dietitian-account-backfill.service";
import { createAuthTestApp, resetAuthDatabase, type AuthTestContext } from "./app";

describe("DietitianAccount Phase 1 backfill", () => {
  let ctx: AuthTestContext;
  let backfill: DietitianAccountBackfillService;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
    backfill = ctx.app.get(DietitianAccountBackfillService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetAuthDatabase(ctx.prisma);
  });

  it("is a Phase 7 no-op that returns zero counters", async () => {
    const summary = await backfill.run();
    expect(summary).toEqual({
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
    });
  });

  it("remains a no-op on repeated runs", async () => {
    const first = await backfill.run();
    const second = await backfill.run();
    expect(first.accountsCreated).toBe(0);
    expect(second.accountsCreated).toBe(0);
    expect(second).toEqual(first);
  });
});
