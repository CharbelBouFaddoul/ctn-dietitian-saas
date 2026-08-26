import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FoodDatasetFile, FoodDatasetRecord } from "./dataset.types";

const GROUP_BY_LETTER: Record<string, string> = {
  A: "Cereals and cereal products",
  B: "Milk and milk products",
  C: "Eggs",
  D: "Vegetables",
  F: "Fruit",
  G: "Nuts and seeds",
  H: "Herbs and spices",
  J: "Fish and fish products",
  M: "Meat and meat products",
  O: "Fats and oils",
  P: "Beverages",
  Q: "Alcoholic beverages",
  S: "Sugars, preserves and snacks",
  W: "Soups, sauces and miscellaneous foods",
};

const MACRO_BY_CODE: Record<string, keyof Pick<FoodDatasetRecord, "energyKcal" | "proteinG" | "fatG" | "carbohydrateG" | "sugarG" | "sodiumMg">> = {
  KCALS: "energyKcal",
  PROT: "proteinG",
  FAT: "fatG",
  CHO: "carbohydrateG",
  TOTSUG: "sugarG",
  NA: "sodiumMg",
};

const EXTRA_BY_CODE: Record<string, string> = {
  SATFOD: "saturatedFatG",
  FODTRANS: "transFatG",
  MONOFOD: "monounsaturatedFatG",
  POLYFOD: "polyunsaturatedFatG",
  CHOL: "cholesterolMg",
  K: "potassiumMg",
  CA: "calciumMg",
  FE: "ironMg",
  MG: "magnesiumMg",
  P: "phosphorusMg",
  ZN: "zincMg",
  CU: "copperMg",
  MN: "manganeseMg",
  SE: "seleniumMcg",
  I: "iodineMcg",
  RETEQU: "vitaminAMcg",
  VITC: "vitaminCMg",
  VITD: "vitaminDMcg",
  VITE: "vitaminEMg",
  VITK1: "vitaminKMcg",
  THIA: "thiaminMg",
  RIBO: "riboflavinMg",
  NIAC: "niacinMg",
  PANTO: "pantothenicAcidMg",
  VITB6: "vitaminB6Mg",
  BIOT: "biotinMcg",
  FOLT: "folateMcg",
  VITB12: "vitaminB12Mcg",
};

export const COFID_SOURCE = {
  key: "cofid-uk",
  name: "McCance and Widdowson’s Composition of Foods Integrated Dataset, 2021",
  provider: "Public Health England / UK Food Databanks",
  datasetVersion: "2021",
  license: "Open Government Licence v3.0. https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  attribution:
    "Nutrient values are adapted from McCance and Widdowson’s The Composition of Foods Integrated Dataset (CoFID) 2021, Public Health England. https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid",
  homepage: "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid",
} as const;

export const COFID_XLSX_URL =
  "https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx";

const SHEET_ALIASES: Record<string, string[]> = {
  Proximates: ["proximates", "13proximates"],
  Inorganics: ["inorganics", "14inorganics"],
  Vitamins: ["vitamins", "15vitamins"],
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      if (field.endsWith("\r")) field = field.slice(0, -1);
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    if (field.endsWith("\r")) field = field.slice(0, -1);
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function normalizeStem(name: string): string {
  return name.replace(/^\uFEFF/, "").replace(/\.csv$/i, "").replace(/[\s._-]+/g, "").toLowerCase();
}

export function findCofidCsv(dir: string, logicalName: string): string {
  const wants = new Set(SHEET_ALIASES[logicalName] ?? [normalizeStem(logicalName)]);
  const match = readdirSync(dir).find((file) => file.toLowerCase().endsWith(".csv") && wants.has(normalizeStem(file)));
  if (!match) {
    throw new Error(`CoFID CSV "${logicalName}" not found in ${dir}`);
  }
  return join(dir, match);
}

function roundAmount(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value * 10) / 10;
  if (abs >= 10) return Math.round(value * 10) / 10;
  if (abs >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 1000) / 1000;
}

/** CoFID uses Tr for trace and N when not determined. Trace is stored as 0; N is omitted. */
export function parseCofidNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === "N") return null;
  if (upper === "TR" || upper === "TRACE") return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function sheetByCode(dir: string, logicalName: string): Map<string, Map<string, string>> {
  const rows = parseCsv(readFileSync(findCofidCsv(dir, logicalName), "utf8"));
  const codes = (rows[1] ?? []).map((cell) => cell.trim());
  const byFood = new Map<string, Map<string, string>>();
  for (const cells of rows.slice(3)) {
    const foodCode = (cells[0] ?? "").trim();
    if (!foodCode) continue;
    const values = new Map<string, string>();
    for (let i = 0; i < cells.length; i += 1) {
      const code = codes[i];
      if (code) values.set(code, (cells[i] ?? "").trim());
    }
    values.set("FoodCode", foodCode);
    if (cells[1]) values.set("FoodName", cells[1].trim());
    if (cells[3]) values.set("Group", cells[3].trim());
    byFood.set(foodCode, values);
  }
  return byFood;
}

function categoryOf(group: string): string | null {
  if (!group) return null;
  return GROUP_BY_LETTER[group[0]!] ?? group;
}

export function datasetFromCofidDir(dir: string): FoodDatasetFile {
  const proximates = sheetByCode(dir, "Proximates");
  const inorganics = sheetByCode(dir, "Inorganics");
  const vitamins = sheetByCode(dir, "Vitamins");

  const converted: FoodDatasetRecord[] = [];
  for (const [foodCode, prox] of proximates) {
    const name = prox.get("FoodName")?.trim();
    if (!name) continue;
    const inn = inorganics.get(foodCode) ?? new Map<string, string>();
    const vit = vitamins.get(foodCode) ?? new Map<string, string>();
    const merged = new Map<string, string>([...prox, ...inn, ...vit]);
    const group = prox.get("Group") ?? "";
    const alcoholic = group.startsWith("Q");
    const fiber = parseCofidNumber(prox.get("AOACFIB")) ?? parseCofidNumber(prox.get("ENGFIB"));

    const extraNutrients: Record<string, number | null> = {};
    for (const [code, key] of Object.entries(EXTRA_BY_CODE)) {
      const amount = parseCofidNumber(merged.get(code));
      if (amount == null) continue;
      extraNutrients[key] = roundAmount(amount);
    }

    const macros: Partial<FoodDatasetRecord> = {};
    for (const [code, field] of Object.entries(MACRO_BY_CODE)) {
      const amount = parseCofidNumber(merged.get(code));
      macros[field] = amount == null ? null : roundAmount(amount);
    }

    converted.push({
      sourceFoodId: foodCode,
      name,
      category: categoryOf(group),
      servingDescription: alcoholic ? "100 ml" : "100 g",
      referenceQuantity: 100,
      referenceUnit: alcoholic ? "ml" : "g",
      energyKcal: macros.energyKcal ?? null,
      proteinG: macros.proteinG ?? null,
      fatG: macros.fatG ?? null,
      carbohydrateG: macros.carbohydrateG ?? null,
      fiberG: fiber == null ? null : roundAmount(fiber),
      sugarG: macros.sugarG ?? null,
      sodiumMg: macros.sodiumMg ?? null,
      extraNutrients: Object.keys(extraNutrients).length ? extraNutrients : undefined,
    });
  }

  return { source: { ...COFID_SOURCE }, foods: converted };
}

export function assertCofidCsvDir(dir: string): void {
  for (const name of Object.keys(SHEET_ALIASES)) findCofidCsv(dir, name);
}
