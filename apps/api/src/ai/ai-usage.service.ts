import { Injectable } from "@nestjs/common";
import { estimateAiCostMicros, microsToUsd } from "@nutrition-saas/config";
import { localDateKey } from "@nutrition-saas/utilities";
import type { AiAction, AiRequestStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const PERIOD_RE = /^\d{4}-\d{2}$/;

export type AiUsagePeriod = {
  periodKey: string;
  requestCount: number;
  tokenCount: number;
  costMicros: number;
};

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** dietitianAccountId is DietitianAccount.id */
  async getUsage(dietitianAccountId: string, periodKey?: string): Promise<AiUsagePeriod> {
    const key = periodKey ?? (await this.currentPeriodKey(dietitianAccountId));
    const row = await this.prisma.aiUsage.findUnique({
      where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey: key } },
    });
    return {
      periodKey: key,
      requestCount: row?.requestCount ?? 0,
      tokenCount: row?.tokenCount ?? 0,
      costMicros: row ? Number(row.costMicros) : 0,
    };
  }

  async currentPeriodKey(dietitianAccountId: string): Promise<string> {
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
    });
    return monthKeyFromInstant(new Date(), settings?.timezone ?? "UTC");
  }

  resolvePeriodKey(requested: string | undefined, current: string): string {
    if (!requested || requested === "current") return current;
    if (!PERIOD_RE.test(requested)) return current;
    return requested;
  }

  previousPeriodKey(periodKey: string): string {
    const [year, month] = periodKey.split("-").map(Number);
    const prior = new Date(Date.UTC(year!, month! - 2, 1));
    return `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  async reserveRequest(
    dietitianAccountId: string,
    limit: number,
  ): Promise<{ allowed: boolean; used: number; tokenCount: number; periodKey: string }> {
    const periodKey = await this.currentPeriodKey(dietitianAccountId);
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.aiUsage.findUnique({
          where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
        });
        const current = existing?.requestCount ?? 0;
        if (current >= limit) {
          return { allowed: false, used: current, tokenCount: existing?.tokenCount ?? 0, periodKey };
        }
        const updated = await tx.aiUsage.upsert({
          where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
          create: {
            dietitianAccountId,
            periodKey,
            requestCount: 1,
          },
          update: { requestCount: { increment: 1 } },
        });
        return {
          allowed: true,
          used: updated.requestCount,
          tokenCount: updated.tokenCount,
          periodKey,
        };
      },
      { isolationLevel: "Serializable" },
    );
  }

  async refundRequest(dietitianAccountId: string, periodKey: string): Promise<void> {
    await this.prisma.aiUsage.updateMany({
      where: { dietitianAccountId, periodKey, requestCount: { gt: 0 } },
      data: { requestCount: { decrement: 1 } },
    });
  }

  async recordCompletion(
    dietitianAccountId: string,
    periodKey: string,
    input: { inputTokens: number; outputTokens: number; costMicros: number },
  ): Promise<void> {
    const tokens = Math.max(0, input.inputTokens) + Math.max(0, input.outputTokens);
    await this.prisma.aiUsage.update({
      where: { dietitianAccountId_periodKey: { dietitianAccountId, periodKey } },
      data: {
        tokenCount: { increment: tokens },
        costMicros: { increment: BigInt(input.costMicros) },
      },
    });
  }

  async requestBreakdown(dietitianAccountId: string, periodKey: string, timezone: string) {
    const { start, end } = periodUtcBounds(periodKey);
    const rows = await this.prisma.aiRequest.findMany({
      where: {
        dietitianAccountId,
        status: "COMPLETED",
        requestedAt: { gte: start, lt: end },
      },
      orderBy: { requestedAt: "desc" },
      take: 500,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });
    return aggregateCompleted(rows, timezone);
  }

  async platformUsage(input: { periodKey: string; q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 25));
    const { start, end } = periodUtcBounds(input.periodKey);
    const nameFilter: Prisma.DietitianAccountWhereInput | undefined = input.q?.trim()
      ? { displayName: { contains: input.q.trim(), mode: "insensitive" } }
      : undefined;

    const [usageRows, totals, recentForChart, ranked] = await Promise.all([
      this.prisma.aiUsage.findMany({
        where: { periodKey: input.periodKey, ...(nameFilter ? { dietitianAccount: nameFilter } : {}) },
        include: { dietitianAccount: { select: { id: true, displayName: true } } },
      }),
      this.prisma.aiRequest.aggregate({
        where: { status: "COMPLETED", requestedAt: { gte: start, lt: end } },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
        _count: true,
      }),
      this.prisma.aiRequest.findMany({
        where: { status: "COMPLETED", requestedAt: { gte: start, lt: end } },
        select: { requestedAt: true, inputTokens: true, outputTokens: true, costMicros: true },
        take: 5000,
      }),
      this.prisma.aiUsage.findMany({
        where: { periodKey: input.periodKey, ...(nameFilter ? { dietitianAccount: nameFilter } : {}) },
        include: { dietitianAccount: { select: { id: true, displayName: true } } },
        orderBy: [{ tokenCount: "desc" }, { requestCount: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const byDayMap = new Map<string, { requests: number; tokens: number; costMicros: number }>();
    for (const row of recentForChart) {
      const date = row.requestedAt.toISOString().slice(0, 10);
      const tokens = (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
      const current = byDayMap.get(date) ?? { requests: 0, tokens: 0, costMicros: 0 };
      current.requests += 1;
      current.tokens += tokens;
      current.costMicros += row.costMicros ? Number(row.costMicros) : 0;
      byDayMap.set(date, current);
    }

    return {
      periodKey: input.periodKey,
      totals: {
        requests: totals._count,
        tokens: (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0),
        costUsd: roundUsd(microsToUsd(Number(totals._sum.costMicros ?? 0n))),
      },
      byDay: [...byDayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => ({
          date,
          requests: row.requests,
          tokens: row.tokens,
          costUsd: roundUsd(microsToUsd(row.costMicros)),
        })),
      items: ranked.map((row) => ({
        dietitianAccountId: row.dietitianAccount.id,
        name: row.dietitianAccount.displayName,
        requests: row.requestCount,
        tokens: row.tokenCount,
        costUsd: roundUsd(microsToUsd(Number(row.costMicros))),
      })),
      total: usageRows.length,
      page,
      pageSize,
    };
  }
}

export function monthKeyFromInstant(instant: Date, timezone: string): string {
  return localDateKey(instant, timezone).slice(0, 7);
}

export function periodUtcBounds(periodKey: string): { start: Date; end: Date } {
  const [year, month] = periodKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year!, month! - 1, 1)),
    end: new Date(Date.UTC(year!, month!, 1)),
  };
}

export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function aggregateCompleted(
  rows: Array<{
    id: string;
    action: AiAction;
    status: AiRequestStatus;
    requestedAt: Date;
    inputTokens: number | null;
    outputTokens: number | null;
    costMicros: bigint | null;
    latencyMs: number | null;
    clientId: string | null;
    client: { id: string; firstName: string; lastName: string; displayName: string | null } | null;
  }>,
  timezone: string,
) {
  const byDayMap = new Map<string, { requests: number; tokens: number; costMicros: number }>();
  const byActionMap = new Map<AiAction, { requests: number; tokens: number; costMicros: number }>();
  let input = 0;
  let output = 0;
  let costMicros = 0;

  for (const row of rows) {
    const inTok = row.inputTokens ?? 0;
    const outTok = row.outputTokens ?? 0;
    const tokens = inTok + outTok;
    const cost = row.costMicros != null ? Number(row.costMicros) : estimateAiCostMicros(null, inTok, outTok);
    input += inTok;
    output += outTok;
    costMicros += cost;

    const date = localDateKey(row.requestedAt, timezone);
    const day = byDayMap.get(date) ?? { requests: 0, tokens: 0, costMicros: 0 };
    day.requests += 1;
    day.tokens += tokens;
    day.costMicros += cost;
    byDayMap.set(date, day);

    const action = byActionMap.get(row.action) ?? { requests: 0, tokens: 0, costMicros: 0 };
    action.requests += 1;
    action.tokens += tokens;
    action.costMicros += cost;
    byActionMap.set(row.action, action);
  }

  return {
    input,
    output,
    tokens: input + output,
    costUsd: roundUsd(microsToUsd(costMicros)),
    byDay: [...byDayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        requests: row.requests,
        tokens: row.tokens,
        costUsd: roundUsd(microsToUsd(row.costMicros)),
      })),
    byAction: [...byActionMap.entries()]
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .map(([action, row]) => ({
        action,
        requests: row.requests,
        tokens: row.tokens,
        costUsd: roundUsd(microsToUsd(row.costMicros)),
      })),
    recent: rows.slice(0, 50).map((row) => ({
      id: row.id,
      requestedAt: row.requestedAt.toISOString(),
      action: row.action,
      status: row.status,
      clientId: row.clientId,
      clientName: row.client
        ? (row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`)
        : null,
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      costUsd: roundUsd(
        microsToUsd(
          row.costMicros != null
            ? Number(row.costMicros)
            : estimateAiCostMicros(null, row.inputTokens ?? 0, row.outputTokens ?? 0),
        ),
      ),
      latencyMs: row.latencyMs,
    })),
  };
}
