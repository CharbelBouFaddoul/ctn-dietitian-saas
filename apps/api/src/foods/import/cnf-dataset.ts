import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FoodDatasetFile, FoodDatasetRecord } from "./dataset.types";

/** USDA-style nutrient codes used by CNF. */
const EXTRA_BY_CODE: Record<number, string> = {
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
  435: "folateMcg",
};

export const CNF_SOURCE = {
  key: "cnf-canada",
  name: "Canadian Nutrient File, 2026",
  provider: "Health Canada",
  datasetVersion: "2026",
  license: "Open Government Licence – Canada. https://open.canada.ca/en/open-government-licence-canada",
  attribution:
    "Nutrient values are adapted from the Canadian Nutrient File (CNF), 2026, Health Canada. https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109",
  homepage: "https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109",
} as const;

export const CNF_CSV_ZIP_URL =
  "https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip";

const CSV_ALIASES: Record<string, string[]> = {
  "FOOD NAME": ["foodname"],
  "FOOD GROUP": ["foodgroup", "cnffoodgroup"],
  "NUTRIENT NAME": ["nutrientname"],
  "NUTRIENT AMOUNT": ["nutrientamount"],
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

function normalizeKey(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/[\s_]+/g, "").toLowerCase();
}

function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((cell) => normalizeKey(cell.trim()));
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) {
      record[header[i]!] = (cells[i] ?? "").trim();
    }
    return record;
  });
}

function field(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = row[normalizeKey(name)];
    if (value) return value;
  }
  return "";
}

function normalizeCsvStem(name: string): string {
  return normalizeKey(name.replace(/\.csv$/i, ""));
}

export function findCnfCsv(dir: string, logicalName: string): string {
  const wants = new Set(CSV_ALIASES[logicalName] ?? [normalizeCsvStem(logicalName)]);
  const match = readdirSync(dir).find((file) => file.toLowerCase().endsWith(".csv") && wants.has(normalizeCsvStem(file)));
  if (!match) {
    throw new Error(`CNF CSV "${logicalName}" not found in ${dir}`);
  }
  return join(dir, match);
}

function readCsv(dir: string, logicalName: string): Record<string, string>[] {
  const buf = readFileSync(findCnfCsv(dir, logicalName));
  const text = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.toString("utf8") : buf.toString("utf8");
  return csvRecords(text);
}

function parseNumber(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function roundAmount(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value * 10) / 10;
  if (abs >= 10) return Math.round(value * 10) / 10;
  if (abs >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 1000) / 1000;
}

export function datasetFromCnfDir(dir: string): FoodDatasetFile {
  const foods = readCsv(dir, "FOOD NAME");
  const groups = readCsv(dir, "FOOD GROUP");
  const nutrientNames = readCsv(dir, "NUTRIENT NAME");
  const amounts = readCsv(dir, "NUTRIENT AMOUNT");

  const groupName = new Map<string, string>();
  for (const row of groups) {
    const id = field(row, "FoodGroupID", "CNF_Food_Group_Code");
    const name = field(row, "FoodGroupName", "CNF_Food_Group_Description_EN");
    if (id && name) groupName.set(id, name);
  }

  const codeByNutrientId = new Map<number, number>();
  for (const row of nutrientNames) {
    const nutrientId = parseNumber(field(row, "NutrientID", "Nutrient_Code"));
    const code = parseNumber(field(row, "NutrientCode", "Nutrient_Code"));
    if (nutrientId == null || code == null) continue;
    codeByNutrientId.set(Math.trunc(nutrientId), Math.trunc(code));
  }

  const byFood = new Map<string, Map<number, number>>();
  for (const row of amounts) {
    const foodId = field(row, "Food_Code", "FoodID");
    const rawCode = parseNumber(field(row, "Nutrient_Code"));
    const rawId = parseNumber(field(row, "NutrientID"));
    const value = parseNumber(field(row, "Nutrient_Amount", "NutrientValue"));
    if (!foodId || value == null) continue;
    const code =
      rawCode != null
        ? Math.trunc(rawCode)
        : rawId != null
          ? (codeByNutrientId.get(Math.trunc(rawId)) ?? null)
          : null;
    if (code == null) continue;
    let nutrients = byFood.get(foodId);
    if (!nutrients) {
      nutrients = new Map();
      byFood.set(foodId, nutrients);
    }
    if (!nutrients.has(code)) nutrients.set(code, value);
  }

  const converted: FoodDatasetRecord[] = [];
  for (const food of foods) {
    const foodId = field(food, "Food_Code", "FoodID");
    const foodCode = field(food, "Food_Code", "FoodCode") || foodId;
    const name = field(food, "Food_Description_EN", "FoodDescription");
    if (!foodId || !foodCode || !name) continue;
    const nutrients = byFood.get(foodId) ?? new Map();
    const energyKcal = nutrients.get(208) ?? (nutrients.has(268) ? nutrients.get(268)! / 4.184 : null);
    const vitaminD = nutrients.get(328) ?? (nutrients.has(324) ? nutrients.get(324)! / 40 : null);
    const extraNutrients: Record<string, number | null> = {};
    for (const [code, key] of Object.entries(EXTRA_BY_CODE)) {
      const amount = nutrients.get(Number(code));
      if (amount == null) continue;
      extraNutrients[key] = roundAmount(amount);
    }
    if (vitaminD != null && extraNutrients.vitaminDMcg == null) {
      extraNutrients.vitaminDMcg = roundAmount(vitaminD);
    }
    const folateDfe = nutrients.get(435);
    if (folateDfe != null) extraNutrients.folateMcg = roundAmount(folateDfe);

    converted.push({
      sourceFoodId: foodCode,
      name,
      category: groupName.get(field(food, "CNF_Food_Group_Code", "FoodGroupID")) ?? null,
      servingDescription: "100 g",
      referenceQuantity: 100,
      referenceUnit: "g",
      energyKcal: energyKcal == null ? null : roundAmount(energyKcal),
      proteinG: nutrients.has(203) ? roundAmount(nutrients.get(203)!) : null,
      fatG: nutrients.has(204) ? roundAmount(nutrients.get(204)!) : null,
      carbohydrateG: nutrients.has(205) ? roundAmount(nutrients.get(205)!) : null,
      fiberG: nutrients.has(291) ? roundAmount(nutrients.get(291)!) : null,
      sugarG: nutrients.has(269) ? roundAmount(nutrients.get(269)!) : null,
      sodiumMg: nutrients.has(307) ? roundAmount(nutrients.get(307)!) : null,
      extraNutrients: Object.keys(extraNutrients).length ? extraNutrients : undefined,
    });
  }

  return { source: { ...CNF_SOURCE }, foods: converted };
}

export function assertCnfCsvDir(dir: string): void {
  for (const name of Object.keys(CSV_ALIASES)) findCnfCsv(dir, name);
}
