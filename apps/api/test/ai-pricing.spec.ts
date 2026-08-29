import { describe, expect, it } from "vitest";
import { estimateAiCostMicros, microsToUsd } from "@nutrition-saas/config";
import { periodUtcBounds, roundUsd } from "../src/ai/ai-usage.service";

function previousPeriodKey(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  const prior = new Date(Date.UTC(year!, month! - 2, 1));
  return `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe("AI pricing and period helpers", () => {
  it("prices known models and falls back for unknown ones", () => {
    const mini = estimateAiCostMicros("gpt-4o-mini", 1_000_000, 1_000_000);
    expect(mini).toBe(750_000);
    expect(microsToUsd(mini)).toBeCloseTo(0.75, 6);

    const full = estimateAiCostMicros("gpt-4o", 1_000_000, 0);
    expect(full).toBe(2_500_000);

    const unknown = estimateAiCostMicros("mock-model", 1_000_000, 0);
    expect(unknown).toBe(estimateAiCostMicros("gpt-4o-mini", 1_000_000, 0));
  });

  it("buckets a period key to UTC month bounds", () => {
    const { start, end } = periodUtcBounds("2026-08");
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(previousPeriodKey("2026-08")).toBe("2026-07");
    expect(previousPeriodKey("2026-01")).toBe("2025-12");
    expect(roundUsd(0.0412349)).toBe(0.041235);
  });
});
