import { describe, expect, it } from "vitest";
import { emptyClinicalData, migrateLegacyIntoClinical, sanitizeClinicalData } from "../src/client-profiles/clinical-data";
import { parseChartNoteDate } from "../src/client-chart-notes/chart-note-date";
import { assertAllowedUpload, isLikelyPlainText } from "../src/documents/file-validation";

describe("clinical data", () => {
  it("drops unknown keys and caps strings", () => {
    const data = sanitizeClinicalData({
      visit: { reason: "a".repeat(5000), extra: "nope" },
      ignored: true,
    });
    expect(data.visit.reason).toHaveLength(4000);
    expect(data.eating.allergies).toBe("");
    expect(data).not.toHaveProperty("ignored");
  });

  it("migrates legacy profile text once", () => {
    const { data, persisted } = migrateLegacyIntoClinical({
      allergies: "peanuts",
      intolerances: "lactose",
      lifestyle: "walks daily",
      notes: "first visit",
    });
    expect(persisted).toBe(true);
    expect(data.eating.allergiesNotes).toBe("peanuts");
    expect(data.eating.intolerancesNotes).toBe("lactose");
    expect(data.lifestyle.other).toBe("walks daily");
    expect(data.visit.other).toBe("first visit");
    expect(migrateLegacyIntoClinical({ clinicalData: emptyClinicalData(), allergies: "x" }).persisted).toBe(false);
  });
});

describe("chart note dates", () => {
  it("parses a calendar date at noon UTC", () => {
    expect(parseChartNoteDate("2026-08-20").toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("defaults to now when empty", () => {
    const before = Date.now() - 1000;
    const parsed = parseChartNoteDate();
    expect(parsed.getTime()).toBeGreaterThanOrEqual(before);
    expect(parsed.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("file validation", () => {
  it("accepts plain text by extension", () => {
    const buffer = Buffer.from("Usual breakfast: oats\n");
    expect(isLikelyPlainText(buffer)).toBe(true);
    expect(assertAllowedUpload(null, "text/plain", "notes.txt", buffer)).toBe("text/plain");
  });

  it("rejects images pretending to be documents", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => assertAllowedUpload("image/png", "image/png", "photo.png", png)).not.toThrow();
    expect(() => assertAllowedUpload(null, "text/plain", "notes.txt", png)).toThrow();
  });
});
