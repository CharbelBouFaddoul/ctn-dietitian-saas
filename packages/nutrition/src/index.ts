export type MassUnit = "g" | "kg" | "oz" | "lb";
export type VolumeUnit = "ml" | "l" | "fl_oz";
export type FoodQuantityUnit = MassUnit | VolumeUnit;

export type NutrientKey =
  | "energyKcal"
  | "proteinG"
  | "carbohydrateG"
  | "fatG"
  | "fiberG"
  | "sugarG"
  | "sodiumMg";

export interface NutritionValues {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export const NUTRIENT_KEYS: NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
];

/** Presentation rounding only. Calculations keep full IEEE precision until this boundary. */
export const NUTRITION_ROUNDING: Record<NutrientKey, number> = {
  energyKcal: 0,
  proteinG: 1,
  carbohydrateG: 1,
  fatG: 1,
  fiberG: 1,
  sugarG: 1,
  sodiumMg: 0,
};

export const ATWATER = {
  proteinKcalPerG: 4,
  carbohydrateKcalPerG: 4,
  fatKcalPerG: 9,
} as const;

/** Flag Atwater vs labeled energy when relative difference exceeds this ratio. */
export const CALORIE_DISCREPANCY_RATIO = 0.25;

const GRAMS_PER_OZ = 28.349523125;
const GRAMS_PER_LB = 453.59237;
const ML_PER_FL_OZ = 29.5735295625;

export function normalizeFoodName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundNutrition(values: NutritionValues): NutritionValues {
  const rounded = { ...values };
  for (const key of NUTRIENT_KEYS) {
    const current = values[key];
    if (current === null) {
      rounded[key] = null;
    } else {
      rounded[key] = roundHalfUp(current, NUTRITION_ROUNDING[key]);
    }
  }
  return rounded;
}

export function scaleNutrition(values: NutritionValues, factor: number): NutritionValues {
  const scaled = { ...values };
  for (const key of NUTRIENT_KEYS) {
    const current = values[key];
    scaled[key] = current === null ? null : current * factor;
  }
  return scaled;
}

export function mergeNutrition(base: NutritionValues, override: Partial<NutritionValues>): NutritionValues {
  return {
    energyKcal: override.energyKcal !== undefined ? override.energyKcal : base.energyKcal,
    proteinG: override.proteinG !== undefined ? override.proteinG : base.proteinG,
    carbohydrateG: override.carbohydrateG !== undefined ? override.carbohydrateG : base.carbohydrateG,
    fatG: override.fatG !== undefined ? override.fatG : base.fatG,
    fiberG: override.fiberG !== undefined ? override.fiberG : base.fiberG,
    sugarG: override.sugarG !== undefined ? override.sugarG : base.sugarG,
    sodiumMg: override.sodiumMg !== undefined ? override.sodiumMg : base.sodiumMg,
  };
}

export function atwaterEnergyKcal(values: Pick<NutritionValues, "proteinG" | "carbohydrateG" | "fatG">): number | null {
  if (values.proteinG === null || values.carbohydrateG === null || values.fatG === null) {
    return null;
  }
  return (
    values.proteinG * ATWATER.proteinKcalPerG +
    values.carbohydrateG * ATWATER.carbohydrateKcalPerG +
    values.fatG * ATWATER.fatKcalPerG
  );
}

export function calorieDiscrepancy(
  labeledKcal: number | null,
  macros: Pick<NutritionValues, "proteinG" | "carbohydrateG" | "fatG">,
): { expectedKcal: number; ratio: number } | null {
  const expected = atwaterEnergyKcal(macros);
  if (labeledKcal === null || expected === null) {
    return null;
  }
  const denom = Math.max(Math.abs(labeledKcal), Math.abs(expected), 1);
  return { expectedKcal: expected, ratio: Math.abs(labeledKcal - expected) / denom };
}

export function isSuspiciousCalorieGap(
  labeledKcal: number | null,
  macros: Pick<NutritionValues, "proteinG" | "carbohydrateG" | "fatG">,
): boolean {
  const gap = calorieDiscrepancy(labeledKcal, macros);
  return gap !== null && gap.ratio > CALORIE_DISCREPANCY_RATIO;
}

export function isMassUnit(unit: string): unit is MassUnit {
  return unit === "g" || unit === "kg" || unit === "oz" || unit === "lb";
}

export function isVolumeUnit(unit: string): unit is VolumeUnit {
  return unit === "ml" || unit === "l" || unit === "fl_oz";
}

export function quantityToGrams(quantity: number, unit: MassUnit): number {
  switch (unit) {
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "oz":
      return quantity * GRAMS_PER_OZ;
    case "lb":
      return quantity * GRAMS_PER_LB;
  }
}

export function quantityToMilliliters(quantity: number, unit: VolumeUnit): number {
  switch (unit) {
    case "ml":
      return quantity;
    case "l":
      return quantity * 1000;
    case "fl_oz":
      return quantity * ML_PER_FL_OZ;
  }
}

export class IncompatibleFoodUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompatibleFoodUnitError";
  }
}

export interface FoodReference {
  referenceQuantity: number;
  referenceUnit: "g" | "ml";
  nutrition: NutritionValues;
}

/**
 * Deterministic quantity scaling against the food's reference amount (typically 100 g or 100 ml).
 * Does not round. Call roundNutrition at API/presentation boundaries.
 */
export function calculateFoodNutrition(
  food: FoodReference,
  quantity: number,
  unit: FoodQuantityUnit,
): NutritionValues {
  if (!(quantity > 0) || !Number.isFinite(quantity)) {
    throw new RangeError("Quantity must be a finite number greater than zero");
  }
  if (!(food.referenceQuantity > 0)) {
    throw new RangeError("Reference quantity must be greater than zero");
  }

  let quantityInReference: number;
  if (food.referenceUnit === "g") {
    if (!isMassUnit(unit)) {
      throw new IncompatibleFoodUnitError("This food is mass-based; use g, kg, oz, or lb");
    }
    quantityInReference = quantityToGrams(quantity, unit);
  } else {
    if (!isVolumeUnit(unit)) {
      throw new IncompatibleFoodUnitError("This food is volume-based; use ml, l, or fl_oz");
    }
    quantityInReference = quantityToMilliliters(quantity, unit);
  }

  return scaleNutrition(food.nutrition, quantityInReference / food.referenceQuantity);
}

/** Known-zero totals (empty recipe or meal). Distinct from unknown/null nutrients. */
export const ZERO_NUTRITION: NutritionValues = {
  energyKcal: 0,
  proteinG: 0,
  carbohydrateG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
};

/**
 * Sum nutrition parts. If any part is unknown (null) for a nutrient, the total for that
 * nutrient is unknown. Empty input is known zero, not unknown.
 */
export function sumNutrition(parts: NutritionValues[]): NutritionValues {
  if (parts.length === 0) {
    return { ...ZERO_NUTRITION };
  }
  const total = { ...parts[0]! };
  for (const part of parts.slice(1)) {
    for (const key of NUTRIENT_KEYS) {
      const left = total[key];
      const right = part[key];
      total[key] = left === null || right === null ? null : left + right;
    }
  }
  return total;
}

export const NUTRITION_ENGINE_VERSION = 1;
