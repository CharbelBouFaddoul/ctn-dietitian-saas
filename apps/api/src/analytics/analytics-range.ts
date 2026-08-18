import { BadRequestException } from "@nestjs/common";
import { dayBoundsUtc, localDateKey, parseLocalDate } from "@nutrition-saas/utilities";

export type AnalyticsPeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_30_days"
  | "last_90_days"
  | "custom";

export interface AnalyticsRange {
  start: Date;
  end: Date;
  period: AnalyticsPeriod;
  timezone: string;
}

export function resolveAnalyticsRange(input: {
  period?: AnalyticsPeriod;
  timezone: string;
  startDate?: string;
  endDate?: string;
}): AnalyticsRange {
  const period = input.period ?? "this_month";
  const now = new Date();
  const todayKey = localDateKey(now, input.timezone);

  if (period === "custom") {
    if (!input.startDate || !input.endDate) {
      throw new BadRequestException("Custom range requires startDate and endDate");
    }
    const start = dayBoundsUtc(input.startDate, input.timezone).start;
    const end = dayBoundsUtc(input.endDate, input.timezone).end;
    return { start, end, period, timezone: input.timezone };
  }

  if (period === "today") {
    const { start, end } = dayBoundsUtc(todayKey, input.timezone);
    return { start, end, period, timezone: input.timezone };
  }

  if (period === "this_week") {
    const weekday = new Date(now.toLocaleString("en-US", { timeZone: input.timezone })).getDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    const startDate = parseLocalDate(todayKey);
    startDate.setUTCDate(startDate.getUTCDate() - mondayOffset);
    const startKey = startDate.toISOString().slice(0, 10);
    const { start } = dayBoundsUtc(startKey, input.timezone);
    const { end } = dayBoundsUtc(todayKey, input.timezone);
    return { start, end, period, timezone: input.timezone };
  }

  if (period === "this_month") {
    const [year, month] = todayKey.split("-");
    const startKey = `${year}-${month}-01`;
    const { start } = dayBoundsUtc(startKey, input.timezone);
    const { end } = dayBoundsUtc(todayKey, input.timezone);
    return { start, end, period, timezone: input.timezone };
  }

  const days = period === "last_30_days" ? 30 : 90;
  const startDate = parseLocalDate(todayKey);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const startKey = startDate.toISOString().slice(0, 10);
  const { start } = dayBoundsUtc(startKey, input.timezone);
  const { end } = dayBoundsUtc(todayKey, input.timezone);
  return { start, end, period, timezone: input.timezone };
}
