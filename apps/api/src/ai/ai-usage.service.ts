import { Injectable } from "@nestjs/common";
import { localDateKey } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(organizationId: string, periodKey?: string) {
    const key = periodKey ?? (await this.currentPeriodKey(organizationId));
    const row = await this.prisma.aiUsage.findUnique({
      where: { organizationId_periodKey: { organizationId, periodKey: key } },
    });
    return { periodKey: key, requestCount: row?.requestCount ?? 0 };
  }

  async reserveRequest(organizationId: string, limit: number): Promise<{ allowed: boolean; used: number; periodKey: string }> {
    const periodKey = await this.currentPeriodKey(organizationId);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.aiUsage.findUnique({
          where: { organizationId_periodKey: { organizationId, periodKey } },
        });
        const current = existing?.requestCount ?? 0;
        if (current >= limit) {
          return { allowed: false, used: current, periodKey };
        }
        const updated = await tx.aiUsage.upsert({
          where: { organizationId_periodKey: { organizationId, periodKey } },
          create: { organizationId, periodKey, requestCount: 1 },
          update: { requestCount: { increment: 1 } },
        });
        return { allowed: true, used: updated.requestCount, periodKey };
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
