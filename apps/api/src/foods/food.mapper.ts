import type { Food, FoodOverride, FoodSource } from "@prisma/client";
import {
  type NutritionValues,
  type NutrientKey,
  type ExtraNutrients,
  NUTRIENT_KEYS,
  atwaterEnergyKcal,
  sanitizeExtraNutrients,
  roundExtraNutrients,
} from "@nutrition-saas/nutrition";

export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

export function nutritionFromRow(row: {
  energyKcal: unknown;
  proteinG: unknown;
  carbohydrateG: unknown;
  fatG: unknown;
  fiberG: unknown;
  sugarG: unknown;
  sodiumMg: unknown;
}): NutritionValues {
  const proteinG = decimalToNumber(row.proteinG);
  const carbohydrateG = decimalToNumber(row.carbohydrateG);
  const fatG = decimalToNumber(row.fatG);
  return {
    energyKcal: decimalToNumber(row.energyKcal) ?? atwaterEnergyKcal({ proteinG, carbohydrateG, fatG }),
    proteinG,
    carbohydrateG,
    fatG,
    fiberG: decimalToNumber(row.fiberG),
    sugarG: decimalToNumber(row.sugarG),
    sodiumMg: decimalToNumber(row.sodiumMg),
  };
}

export function extraNutrientsFromRow(row: { extraNutrients?: unknown }): ExtraNutrients {
  return sanitizeExtraNutrients(row.extraNutrients) ?? {};
}

export function overrideNutrition(row: FoodOverride | null): Partial<NutritionValues> {
  if (!row || row.status !== "ACTIVE") {
    return {};
  }
  const partial: Partial<NutritionValues> = {};
  const source = nutritionFromRow(row);
  for (const key of NUTRIENT_KEYS) {
    if (row[key] !== null) {
      partial[key] = source[key];
    }
  }
  return partial;
}

export function overriddenFields(override: Partial<NutritionValues>): NutrientKey[] {
  return NUTRIENT_KEYS.filter((key) => override[key] !== undefined);
}

export function sourcePayload(source: FoodSource) {
  return {
    id: source.id,
    key: source.key,
    name: source.name,
    provider: source.provider,
    datasetVersion: source.datasetVersion,
    license: source.license,
    attribution: source.attribution,
    homepage: source.homepage,
  };
}

export function foodIdentity(food: Food) {
  return {
    id: food.id,
    name: food.name,
    category: food.category,
    servingDescription: food.servingDescription,
    referenceQuantity: Number(food.referenceQuantity),
    referenceUnit: food.referenceUnit,
    sourceFoodId: food.sourceFoodId,
    status: food.status,
  };
}

export function nutritionPayloadExtras(row: { extraNutrients?: unknown }) {
  const extraNutrients = extraNutrientsFromRow(row);
  return {
    extraNutrients,
    presentedExtraNutrients: roundExtraNutrients(extraNutrients),
  };
}
