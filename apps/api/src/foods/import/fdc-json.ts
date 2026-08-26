import { readFileSync } from "node:fs";
import type { FoodDatasetFile, FoodDatasetRecord, FoodDatasetSourceMeta } from "./dataset.types";

const EXTRA_BY_NUMBER: Record<number, string> = {
  601: "cholesterolMg",
  606: "saturatedFatG",
  605: "transFatG",
  645: "monounsaturatedFatG",
  646: "polyunsaturatedFatG",
  306: "potassiumMg",
  301: "calciumMg",
  303: "ironMg",
  304: "magnesiumMg",
  305: "phosphorusMg",
  309: "zincMg",
  312: "copperMg",
  315: "manganeseMg",
  317: "seleniumMcg",
  313: "fluorideMcg",
  314: "iodineMcg",
  320: "vitaminAMcg",
  401: "vitaminCMg",
  328: "vitaminDMcg",
  323: "vitaminEMg",
  430: "vitaminKMcg",
  404: "thiaminMg",
  405: "riboflavinMg",
  406: "niacinMg",
  410: "pantothenicAcidMg",
  415: "vitaminB6Mg",
  416: "biotinMcg",
  417: "folateMcg",
  418: "vitaminB12Mcg",
  421: "cholineMg",
};

type FdcNutrient = {
  amount?: number;
  value?: number;
  nutrientNumber?: string | number;
  nutrientNbr?: string | number;
  nutrient?: { number?: string | number; name?: string };
};

export type FdcFood = {
  fdcId?: number;
  description?: string;
  foodCategory?: { description?: string } | string;
  foodNutrients?: FdcNutrient[];
};

function nutrientNumber(entry: FdcNutrient): number | null {
  const raw = entry.nutrient?.number ?? entry.nutrientNumber ?? entry.nutrientNbr ?? null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function nutrientAmount(entry: FdcNutrient): number | null {
  const amount = entry.amount ?? entry.value;
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function roundAmount(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value * 10) / 10;
  if (abs >= 10) return Math.round(value * 10) / 10;
  if (abs >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 1000) / 1000;
}

function amountsByNumber(foodNutrients: FdcNutrient[] | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(foodNutrients)) return map;
  for (const entry of foodNutrients) {
    const nbr = nutrientNumber(entry);
    const amount = nutrientAmount(entry);
    if (nbr == null || amount == null || map.has(nbr)) continue;
    map.set(nbr, amount);
  }
  return map;
}

function categoryOf(food: FdcFood): string | null {
  const category = food.foodCategory;
  if (typeof category === "string") {
    const trimmed = category.trim();
    return trimmed || null;
  }
  const desc = category?.description?.trim();
  return desc || null;
}

export function convertFdcFood(food: FdcFood): FoodDatasetRecord | null {
  if (food.fdcId == null || !food.description?.trim()) return null;
  const byNumber = amountsByNumber(food.foodNutrients);
  const energyKcal = byNumber.get(208) ?? (byNumber.has(268) ? byNumber.get(268)! / 4.184 : null);
  const vitaminD = byNumber.get(328) ?? (byNumber.has(324) ? byNumber.get(324)! / 40 : null);
  const extraNutrients: Record<string, number | null> = {};
  for (const [nbr, key] of Object.entries(EXTRA_BY_NUMBER)) {
    const amount = byNumber.get(Number(nbr));
    if (amount == null) continue;
    extraNutrients[key] = roundAmount(amount);
  }
  if (vitaminD != null && extraNutrients.vitaminDMcg == null) {
    extraNutrients.vitaminDMcg = roundAmount(vitaminD);
  }
  const folateDfe = byNumber.get(435);
  if (folateDfe != null) extraNutrients.folateMcg = roundAmount(folateDfe);

  return {
    sourceFoodId: String(food.fdcId),
    name: food.description.trim(),
    category: categoryOf(food),
    servingDescription: "100 g",
    referenceQuantity: 100,
    referenceUnit: "g",
    energyKcal: energyKcal == null ? null : roundAmount(energyKcal),
    proteinG: byNumber.has(203) ? roundAmount(byNumber.get(203)!) : null,
    fatG: byNumber.has(204) ? roundAmount(byNumber.get(204)!) : null,
    carbohydrateG: byNumber.has(205) ? roundAmount(byNumber.get(205)!) : null,
    fiberG: byNumber.has(291) ? roundAmount(byNumber.get(291)!) : null,
    sugarG: byNumber.has(269) ? roundAmount(byNumber.get(269)!) : null,
    sodiumMg: byNumber.has(307) ? roundAmount(byNumber.get(307)!) : null,
    extraNutrients: Object.keys(extraNutrients).length ? extraNutrients : undefined,
  };
}

export function datasetFromFdcJson(
  dumpPath: string,
  source: FoodDatasetSourceMeta,
  arrayKeys: string[],
): FoodDatasetFile {
  const raw = JSON.parse(readFileSync(dumpPath, "utf8")) as Record<string, unknown>;
  let foods: FdcFood[] | undefined;
  for (const key of arrayKeys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      foods = value as FdcFood[];
      break;
    }
  }
  if (!foods) {
    throw new Error(`FDC dump missing ${arrayKeys.join(" or ")}`);
  }
  const converted: FoodDatasetRecord[] = [];
  for (const food of foods) {
    if (!food) continue;
    const row = convertFdcFood(food);
    if (row) converted.push(row);
  }
  return { source: { ...source }, foods: converted };
}
