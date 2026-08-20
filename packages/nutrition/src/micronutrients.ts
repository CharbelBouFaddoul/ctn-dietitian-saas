/** Canonical micronutrient / lipid extras stored on Food.extraNutrients (JSON). */
export type MicronutrientKey =
  | "cholesterolMg"
  | "saturatedFatG"
  | "transFatG"
  | "monounsaturatedFatG"
  | "polyunsaturatedFatG"
  | "potassiumMg"
  | "calciumMg"
  | "ironMg"
  | "magnesiumMg"
  | "phosphorusMg"
  | "zincMg"
  | "copperMg"
  | "manganeseMg"
  | "seleniumMcg"
  | "vitaminAMcg"
  | "vitaminCMg"
  | "vitaminDMcg"
  | "vitaminEMg"
  | "vitaminKMcg"
  | "thiaminMg"
  | "riboflavinMg"
  | "niacinMg"
  | "vitaminB6Mg"
  | "folateMcg"
  | "vitaminB12Mcg"
  | "cholineMg";

export type ExtraNutrients = Partial<Record<MicronutrientKey, number | null>>;

export interface MicronutrientDef {
  key: MicronutrientKey;
  label: string;
  unit: string;
  group: "lipids" | "minerals" | "vitamins";
  decimals: number;
}

export const MICRONUTRIENT_DEFS: readonly MicronutrientDef[] = [
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", group: "lipids", decimals: 0 },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g", group: "lipids", decimals: 1 },
  { key: "transFatG", label: "Trans fat", unit: "g", group: "lipids", decimals: 2 },
  { key: "monounsaturatedFatG", label: "Monounsaturated fat", unit: "g", group: "lipids", decimals: 1 },
  { key: "polyunsaturatedFatG", label: "Polyunsaturated fat", unit: "g", group: "lipids", decimals: 1 },
  { key: "potassiumMg", label: "Potassium", unit: "mg", group: "minerals", decimals: 0 },
  { key: "calciumMg", label: "Calcium", unit: "mg", group: "minerals", decimals: 0 },
  { key: "ironMg", label: "Iron", unit: "mg", group: "minerals", decimals: 1 },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg", group: "minerals", decimals: 0 },
  { key: "phosphorusMg", label: "Phosphorus", unit: "mg", group: "minerals", decimals: 0 },
  { key: "zincMg", label: "Zinc", unit: "mg", group: "minerals", decimals: 1 },
  { key: "copperMg", label: "Copper", unit: "mg", group: "minerals", decimals: 2 },
  { key: "manganeseMg", label: "Manganese", unit: "mg", group: "minerals", decimals: 2 },
  { key: "seleniumMcg", label: "Selenium", unit: "µg", group: "minerals", decimals: 1 },
  { key: "vitaminAMcg", label: "Vitamin A (RAE)", unit: "µg", group: "vitamins", decimals: 0 },
  { key: "vitaminCMg", label: "Vitamin C", unit: "mg", group: "vitamins", decimals: 1 },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "µg", group: "vitamins", decimals: 1 },
  { key: "vitaminEMg", label: "Vitamin E", unit: "mg", group: "vitamins", decimals: 1 },
  { key: "vitaminKMcg", label: "Vitamin K", unit: "µg", group: "vitamins", decimals: 1 },
  { key: "thiaminMg", label: "Thiamin (B1)", unit: "mg", group: "vitamins", decimals: 2 },
  { key: "riboflavinMg", label: "Riboflavin (B2)", unit: "mg", group: "vitamins", decimals: 2 },
  { key: "niacinMg", label: "Niacin (B3)", unit: "mg", group: "vitamins", decimals: 1 },
  { key: "vitaminB6Mg", label: "Vitamin B6", unit: "mg", group: "vitamins", decimals: 2 },
  { key: "folateMcg", label: "Folate", unit: "µg", group: "vitamins", decimals: 0 },
  { key: "vitaminB12Mcg", label: "Vitamin B12", unit: "µg", group: "vitamins", decimals: 2 },
  { key: "cholineMg", label: "Choline", unit: "mg", group: "vitamins", decimals: 0 },
] as const;

export const MICRONUTRIENT_KEYS: MicronutrientKey[] = MICRONUTRIENT_DEFS.map((d) => d.key);

const KEY_SET = new Set<string>(MICRONUTRIENT_KEYS);

export function isMicronutrientKey(key: string): key is MicronutrientKey {
  return KEY_SET.has(key);
}

/** Keep only known keys with finite ≥ 0 numbers (or explicit null). */
export function sanitizeExtraNutrients(input: unknown): ExtraNutrients | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const out: ExtraNutrients = {};
  let any = false;
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (!isMicronutrientKey(rawKey)) continue;
    if (rawValue === null) {
      out[rawKey] = null;
      any = true;
      continue;
    }
    const n = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(n) || n < 0) continue;
    out[rawKey] = n;
    any = true;
  }
  return any ? out : null;
}

export function roundExtraNutrients(values: ExtraNutrients): ExtraNutrients {
  const rounded: ExtraNutrients = {};
  for (const def of MICRONUTRIENT_DEFS) {
    const current = values[def.key];
    if (current === undefined) continue;
    if (current === null) {
      rounded[def.key] = null;
    } else {
      const factor = 10 ** def.decimals;
      rounded[def.key] = Math.round((current + Number.EPSILON) * factor) / factor;
    }
  }
  return rounded;
}

export function scaleExtraNutrients(values: ExtraNutrients, factor: number): ExtraNutrients {
  const scaled: ExtraNutrients = {};
  for (const key of MICRONUTRIENT_KEYS) {
    const current = values[key];
    if (current === undefined) continue;
    scaled[key] = current === null ? null : current * factor;
  }
  return scaled;
}

/**
 * Sum micronutrient parts. Missing keys on a part are treated as absent (not zero poisoning).
 * Explicit null on any part makes that nutrient unknown in the total.
 */
export function sumExtraNutrients(parts: ExtraNutrients[]): ExtraNutrients {
  const total: ExtraNutrients = {};
  for (const key of MICRONUTRIENT_KEYS) {
    let sum = 0;
    let any = false;
    let unknown = false;
    for (const part of parts) {
      const value = part[key];
      if (value === undefined) continue;
      if (value === null) {
        unknown = true;
        break;
      }
      sum += value;
      any = true;
    }
    if (unknown) total[key] = null;
    else if (any) total[key] = sum;
  }
  return total;
}
