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

  async getUsageSummary(organizationId: string) {
    const [enabled, ruleLimit, executionLimit, usage] = await Promise.all([
      this.entitlements.can(organizationId, FEATURE_KEYS.AUTOMATION),
      this.entitlements.limit(organizationId, FEATURE_KEYS.AUTOMATION_RULE_LIMIT),
      this.entitlements.limit(organizationId, FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT),
      this.getExecutionCount(organizationId),
    ]);
    const activeRules = await this.prisma.automationRule.count({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
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

  async getExecutionCount(organizationId: string, periodKey?: string) {
    const key = periodKey ?? (await this.currentPeriodKey(organizationId));
    const row = await this.prisma.automationUsage.findUnique({
      where: { organizationId_periodKey: { organizationId, periodKey: key } },
    });
    return { periodKey: key, executionCount: row?.executionCount ?? 0 };
  }

  async reserveExecution(
    organizationId: string,
    limit: number,
  ): Promise<{ allowed: boolean; used: number; periodKey: string }> {
    const periodKey = await this.currentPeriodKey(organizationId);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.automationUsage.findUnique({
          where: { organizationId_periodKey: { organizationId, periodKey } },
        });
        const current = existing?.executionCount ?? 0;
        if (current >= limit) {
          return { allowed: false, used: current, periodKey };
        }
        const updated = await tx.automationUsage.upsert({
          where: { organizationId_periodKey: { organizationId, periodKey } },
          create: { organizationId, periodKey, executionCount: 1 },
          update: { executionCount: { increment: 1 } },
        });
        return { allowed: true, used: updated.executionCount, periodKey };
      },
      { isolationLevel: "Serializable" },
    );
  }

  private async currentPeriodKey(organizationId: string): Promise<string> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { organizationId } });
    const timezone = settings?.timezone ?? "UTC";
    const today = localDateKey(new Date(), timezone);
    return today.slice(0, 7);
  }
}
