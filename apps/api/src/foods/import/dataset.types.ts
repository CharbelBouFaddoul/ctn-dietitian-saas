import type { NutritionValues } from "@nutrition-saas/nutrition";

export interface FoodDatasetSourceMeta {
  key: string;
  name: string;
  provider: string;
  datasetVersion: string;
  license: string;
  attribution: string;
  homepage?: string;
}

export interface FoodDatasetRecord {
  sourceFoodId: string;
  name: string;
  category?: string | null;
  servingDescription?: string | null;
  referenceQuantity: number;
  referenceUnit: "g" | "ml";
  energyKcal?: number | null;
  proteinG?: number | null;
  carbohydrateG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  extraNutrients?: Record<string, number | null>;
}

export interface FoodDatasetFile {
  source: FoodDatasetSourceMeta;
  foods: FoodDatasetRecord[];
}

export interface ImportReport {
  sourceKey: string;
  datasetVersion: string;
  processed: number;
  imported: number;
  updated: number;
  skipped: number;
  rejected: number;
  duplicateSourceIds: number;
  missingNutritionFields: number;
  invalidNumericValues: number;
  suspiciousCalorieGaps: number;
  rejections: Array<{ sourceFoodId?: string; reason: string }>;
  suspicious: Array<{ sourceFoodId: string; labeledKcal: number; expectedKcal: number }>;
}

export type FoodNutritionSnapshot = NutritionValues;
