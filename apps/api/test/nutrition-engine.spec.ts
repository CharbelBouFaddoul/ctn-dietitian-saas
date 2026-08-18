import { describe, expect, it } from "vitest";
import {
  calculateFoodNutrition,
  IncompatibleFoodUnitError,
  isSuspiciousCalorieGap,
  mergeNutrition,
  normalizeFoodName,
  quantityToGrams,
  roundHalfUp,
  roundNutrition,
  scaleNutrition,
  sumNutrition,
} from "@nutrition-saas/nutrition";

const chicken = {
  referenceQuantity: 100,
  referenceUnit: "g" as const,
  nutrition: {
    energyKcal: 165,
    proteinG: 31,
    carbohydrateG: 0,
    fatG: 3.6,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 74,
  },
};

const unknownFiber = {
  ...chicken.nutrition,
  fiberG: null,
};

describe("nutrition engine", () => {
  it("scales 100g and 250g chicken breast", () => {
    expect(calculateFoodNutrition(chicken, 100, "g")).toEqual(chicken.nutrition);
    expect(calculateFoodNutrition(chicken, 250, "g")).toEqual({
      energyKcal: 412.5,
      proteinG: 77.5,
      carbohydrateG: 0,
      fatG: 9,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 185,
    });
  });

  it("handles decimal quantities", () => {
    const result = calculateFoodNutrition(chicken, 33.3, "g");
    expect(result.energyKcal).toBeCloseTo(54.945, 5);
    expect(result.proteinG).toBeCloseTo(10.323, 5);
  });

  it("converts ounces to grams before scaling", () => {
    const grams = quantityToGrams(1, "oz");
    const result = calculateFoodNutrition(chicken, 1, "oz");
    expect(result.energyKcal).toBeCloseTo(165 * (grams / 100), 10);
  });

  it("keeps null nutrition null and zero nutrition zero", () => {
    const scaled = scaleNutrition(unknownFiber, 2.5);
    expect(scaled.fiberG).toBeNull();
    expect(scaled.carbohydrateG).toBe(0);
    expect(scaled.energyKcal).toBe(412.5);
  });

  it("merges only overridden fields", () => {
    const effective = mergeNutrition(chicken.nutrition, { energyKcal: 180 });
    expect(effective.energyKcal).toBe(180);
    expect(effective.proteinG).toBe(31);
    expect(effective.fatG).toBe(3.6);
  });

  it("rounds only at the presentation boundary", () => {
    const raw = calculateFoodNutrition(chicken, 33.3, "g");
    expect(raw.energyKcal).not.toBe(55);
    expect(roundNutrition(raw).energyKcal).toBe(55);
    expect(roundNutrition(raw).proteinG).toBe(10.3);
    expect(roundHalfUp(1.25, 1)).toBe(1.3);
  });

  it("rejects incompatible units", () => {
    expect(() => calculateFoodNutrition(chicken, 100, "ml")).toThrow(IncompatibleFoodUnitError);
  });

  it("normalizes search names", () => {
    expect(normalizeFoodName("  Chicken, Breast! ")).toBe("chicken breast");
  });

  it("sums nutrition while preserving null vs zero", () => {
    expect(sumNutrition([])).toEqual({
      energyKcal: 0,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    });
    expect(sumNutrition([chicken.nutrition, { ...chicken.nutrition, fiberG: null }]).fiberG).toBeNull();
    expect(sumNutrition([chicken.nutrition, chicken.nutrition]).energyKcal).toBe(330);
  });

  it("flags suspicious calorie gaps without overwriting", () => {
    expect(isSuspiciousCalorieGap(900, { proteinG: 1, carbohydrateG: 1, fatG: 1 })).toBe(true);
    expect(isSuspiciousCalorieGap(165, { proteinG: 31, carbohydrateG: 0, fatG: 3.6 })).toBe(false);
  });
});
