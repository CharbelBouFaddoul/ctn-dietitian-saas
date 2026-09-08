import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFacultyAbw,
  computeFacultyIbw,
  computeFrameRatio,
  computeWhr,
  facultyFrameSize,
  facultyObeseForAbw,
  isFacultyMethod,
  percentOf,
  percentWeightChange,
  resolveNutritionMethod,
  sanitizeNutritionMethod,
  facultyTargetsFromExchanges,
  tallyExchanges,
  whrElevated,
} from "./faculty-nutrition.ts";

describe("nutrition method", () => {
  it("treats only faculty_lebanon as the Faculty path", () => {
    assert.equal(isFacultyMethod("faculty_lebanon"), true);
    assert.equal(isFacultyMethod("iom"), false);
    assert.equal(isFacultyMethod(undefined), false);
  });

  it("keeps a stored method and otherwise uses the clinic default", () => {
    assert.equal(resolveNutritionMethod("faculty_lebanon", "iom"), "faculty_lebanon");
    assert.equal(resolveNutritionMethod(undefined, "faculty_lebanon"), "faculty_lebanon");
    assert.equal(sanitizeNutritionMethod("hamwi"), "iom");
  });
});

describe("faculty IBW / ABW", () => {
  it("matches the Documentation women sample (75 kg, 172 cm, 48 y)", () => {
    const ibw = computeFacultyIbw(172, "FEMALE", 48);
    assert.equal(ibw, 62.3);
    assert.equal(percentOf(75, ibw), 120.4);
    assert.equal(computeFacultyAbw(75, ibw), 65.5);
    assert.equal(facultyObeseForAbw(25.4, 120.4), false);
  });

  it("matches faculty Hamwi for adult men", () => {
    const ibw = computeFacultyIbw(175, "MALE", 35);
    assert.equal(ibw, 72.6);
    assert.equal(percentOf(95, ibw), 130.9);
    assert.equal(facultyObeseForAbw(31, 130.9), true);
    assert.equal(computeFacultyAbw(95, ibw), 78.2);
  });

  it("hides Hamwi IBW for children", () => {
    assert.equal(computeFacultyIbw(115, "MALE", 8), null);
  });
});

describe("faculty weight change", () => {
  it("uses (usual − current) / usual, not the male-sheet operator bug", () => {
    assert.equal(percentWeightChange(70, 75), -7.1);
    assert.equal(percentWeightChange(80, 76), 5);
  });
});

describe("faculty WHR and frame", () => {
  it("flags WHO waist-hip cutoffs", () => {
    assert.equal(computeWhr(70, 78), 0.9);
    assert.equal(whrElevated(0.9, "FEMALE"), true);
    assert.equal(whrElevated(0.89, "MALE"), false);
  });

  it("classifies Grant frame size", () => {
    assert.equal(computeFrameRatio(172, 20), 8.6);
    assert.equal(facultyFrameSize(8.6, "FEMALE"), "Large");
    assert.equal(facultyFrameSize(10.5, "MALE"), "Small");
  });
});

describe("faculty exchanges", () => {
  it("tallies fat and sugar from their own rows", () => {
    const tally = tallyExchanges({
      milkFatFree: 1,
      fruit: 3,
      bread: 10,
      vegetable: 8,
      meatLean: 6,
      fatMufa: 7,
      fatPufa: 2,
      fatSafa: 3,
      sugar: 0,
    });
    assert.equal(tally.carbohydrateG, 247);
    assert.equal(tally.proteinG, 96);
    assert.equal(tally.fatG, 91);
    assert.equal(tally.exchangeKcal, 2090);
    assert.equal(tally.atwaterKcal, 2191);
    const pufa = tally.lines.find((line) => line.id === "fatPufa");
    const safa = tally.lines.find((line) => line.id === "fatSafa");
    const sugar = tally.lines.find((line) => line.id === "sugar");
    assert.equal(pufa?.kcalTotal, 90);
    assert.equal(safa?.kcalTotal, 135);
    assert.equal(sugar?.choTotalG, 0);
    assert.ok(tally.carbPct != null && tally.proteinPct != null && tally.fatPct != null);
    assert.equal(Math.round((tally.carbPct ?? 0) + (tally.proteinPct ?? 0) + (tally.fatPct ?? 0)), 100);
  });

  it("sends only exchange Atwater totals as Nutrition targets", () => {
    assert.deepEqual(facultyTargetsFromExchanges({}), {
      energyKcal: null,
      fatG: null,
      carbohydrateG: null,
      proteinG: null,
      fiberG: null,
    });
    const targets = facultyTargetsFromExchanges({ milkFatFree: 2, fruit: 3 });
    assert.equal(targets.energyKcal, tallyExchanges({ milkFatFree: 2, fruit: 3 }).atwaterKcal);
    assert.ok(targets.energyKcal != null && targets.energyKcal > 0);
    assert.equal(targets.fiberG, null);
  });
});
