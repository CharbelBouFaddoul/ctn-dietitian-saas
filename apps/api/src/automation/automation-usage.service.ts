import { Injectable } from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { localDateKey } from "@nutrition-saas/utilities";
import { EntitlementService } from "../entitlements/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AutomationUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  /** Phase 1: organizationId argument is DietitianAccount.id */
  async getUsageSummary(dietitianAccountId: string) {
    const [enabled, ruleLimit, executionLimit, usage] = await Promise.all([
      this.entitlements.can(dietitianAccountId, FEATURE_KEYS.AUTOMATION),
      this.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AUTOMATION_RULE_LIMIT),
      this.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT),
      this.getExecutionCount(dietitianAccountId),
    ]);
    const activeRules = await this.prisma.automationRule.count({
      where: { dietitianAccountId, status: "ACTIVE", archivedAt: null },
    });
    return {
      enabled,
      ruleLimit,
      activeRules,
      rulesRemaining: ruleLimit == null ? null : Math.max(0, ruleLimit - activeRules),
      executionLimit,
      executionCount: usage.executionCount,
      periodKey: usage.periodKey,
      executionsRemaining:
        executionLimit == null ? null : Math.max(0, executionLimit - usage.executionCount),
    };
  }

  async getExecutionCount(dietitianAccountId: string, periodKey?: string) {
    const key = periodKey ?? (await this.currentPeriodKey(dietitianAccountId));
    const row = await this.prisma.automationUsage.findUnique({
      where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey: key } },
    });
    return { periodKey: key, executionCount: row?.executionCount ?? 0 };
  }

  async reserveExecution(
    dietitianAccountId: string,
    limit: number,
  ): Promise<{ allowed: boolean; used: number; periodKey: string }> {
    const periodKey = await this.currentPeriodKey(dietitianAccountId);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.automationUsage.findUnique({
          where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
        });
        const current = existing?.executionCount ?? 0;
        if (current >= limit) {
          return { allowed: false, used: current, periodKey };
        }
        const updated = await tx.automationUsage.upsert({
          where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
          create: {
            dietitianAccountId,
            periodKey,
            executionCount: 1,
          },
          update: { executionCount: { increment: 1 } },
        });
        return { allowed: true, used: updated.executionCount, periodKey };
      },
      { isolationLevel: "Serializable" },
    );
  }

  private async currentPeriodKey(dietitianAccountId: string): Promise<string> {
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
    });
    const timezone = settings?.timezone ?? "UTC";
    const today = localDateKey(new Date(), timezone);
    return today.slice(0, 7);
  }
}
