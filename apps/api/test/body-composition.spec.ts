import { describe, expect, it } from "vitest";
import { deduceBodyComposition } from "../src/client-measurements/body-composition";

describe("deduceBodyComposition", () => {
  it("fills fat mass, lean mass, and body fat % from weight plus one of the pair", () => {
    const fromPercent = deduceBodyComposition({
      WEIGHT: [{ id: "w", at: "2026-01-01T12:00:00.000Z", value: 80, unit: "kg" }],
      BODY_FAT: [{ id: "bf", at: "2026-01-01T12:00:00.000Z", value: 25, unit: "%" }],
    });
    expect(fromPercent.FAT_MASS?.[0]?.value).toBe(20);
    expect(fromPercent.LEAN_MASS?.[0]?.value).toBe(60);

    const fromMass = deduceBodyComposition({
      WEIGHT: [{ id: "w", at: "2026-01-01T12:00:00.000Z", value: 80, unit: "kg" }],
      FAT_MASS: [{ id: "fm", at: "2026-01-01T12:00:00.000Z", value: 20, unit: "kg" }],
    });
    expect(fromMass.BODY_FAT?.[0]?.value).toBe(25);
    expect(fromMass.LEAN_MASS?.[0]?.value).toBe(60);
  });

  it("does not overwrite a recorded value on the same day", () => {
    const series = deduceBodyComposition({
      WEIGHT: [{ id: "w", at: "2026-01-01T12:00:00.000Z", value: 80, unit: "kg" }],
      BODY_FAT: [{ id: "bf", at: "2026-01-01T12:00:00.000Z", value: 25, unit: "%" }],
      FAT_MASS: [{ id: "fm", at: "2026-01-01T12:00:00.000Z", value: 18, unit: "kg" }],
    });
    expect(series.FAT_MASS).toHaveLength(1);
    expect(series.FAT_MASS?.[0]?.value).toBe(18);
    expect(series.LEAN_MASS?.[0]?.value).toBe(62);
  });
});
