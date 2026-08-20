import { Injectable } from "@nestjs/common";
import { localDateKey } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** Phase 1: organizationId argument is DietitianAccount.id */
  async getUsage(dietitianAccountId: string, periodKey?: string) {
    const key = periodKey ?? (await this.currentPeriodKey(dietitianAccountId));
    const row = await this.prisma.aiUsage.findUnique({
      where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey: key } },
    });
    return { periodKey: key, requestCount: row?.requestCount ?? 0 };
  }

  async reserveRequest(
    dietitianAccountId: string,
    limit: number,
  ): Promise<{ allowed: boolean; used: number; periodKey: string }> {
    const periodKey = await this.currentPeriodKey(dietitianAccountId);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.aiUsage.findUnique({
          where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
        });
        const current = existing?.requestCount ?? 0;
        if (current >= limit) {
          return { allowed: false, used: current, periodKey };
        }
        const updated = await tx.aiUsage.upsert({
          where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
          create: {
            dietitianAccountId,
            organizationId: dietitianAccountId,
            periodKey,
            requestCount: 1,
          },
          update: { requestCount: { increment: 1 } },
        });
        return { allowed: true, used: updated.requestCount, periodKey };
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
