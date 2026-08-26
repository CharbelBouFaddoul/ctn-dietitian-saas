import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { replaceCatalogFoods } from "./catalog-replace";
import { importFoodDataset } from "./importer";
import { assertCofidCsvDir, COFID_XLSX_URL, datasetFromCofidDir } from "./cofid-dataset";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const CACHE_CANDIDATES = ["food-data/.cofid-cache", "apps/api/food-data/.cofid-cache"];
const XLSX_NAME = "McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021.xlsx";
const CSV_DIR_NAME = "csv";

const EXTRACT_PY = `
from pathlib import Path
import csv
import sys
from openpyxl import load_workbook

xlsx_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
wb = load_workbook(xlsx_path, read_only=True, data_only=True)
sheets = {
    "1.3 Proximates": "Proximates.csv",
    "1.4 Inorganics": "Inorganics.csv",
    "1.5 Vitamins": "Vitamins.csv",
}
for sheet_name, csv_name in sheets.items():
    ws = wb[sheet_name]
    with (out_dir / csv_name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        for row in ws.iter_rows(values_only=True):
            writer.writerow(["" if cell is None else cell for cell in row])
wb.close()
`;

function argValue(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(prefix));
  return flag ? flag.slice(prefix.length) : undefined;
}

function cacheDir(): string {
  const dirFlag = argValue("--dir=");
  if (dirFlag) return resolve(process.cwd(), dirFlag);
  for (const candidate of CACHE_CANDIDATES) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) return path;
  }
  return resolve(process.cwd(), CACHE_CANDIDATES[0]!);
}

function csvDir(root: string): string {
  return resolve(root, CSV_DIR_NAME);
}

async function downloadXlsx(xlsxPath: string): Promise<void> {
  process.stdout.write("Downloading McCance and Widdowson CoFID 2021…\n");
  const response = await fetch(COFID_XLSX_URL);
  if (!response.ok) {
    throw new Error(
      `CoFID 2021 download failed (${response.status}). Save ${XLSX_NAME} under food-data/.cofid-cache/ or pass --xlsx=`,
    );
  }
  writeFileSync(xlsxPath, Buffer.from(await response.arrayBuffer()));
}

function extractCsvs(xlsxPath: string, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  const scriptPath = resolve(outDir, "_extract_cofid.py");
  writeFileSync(scriptPath, EXTRACT_PY);
  process.stdout.write(`Extracting CoFID sheets from ${xlsxPath}\n`);
  execFileSync("python3", [scriptPath, xlsxPath, outDir], { stdio: "inherit" });
}

async function ensureCsvDir(root: string): Promise<string> {
  const dir = csvDir(root);
  try {
    assertCofidCsvDir(dir);
    return dir;
  } catch {
    /* extract */
  }
  mkdirSync(root, { recursive: true });
  const xlsxPath = argValue("--xlsx=") ? resolve(process.cwd(), argValue("--xlsx=")!) : resolve(root, XLSX_NAME);
  if (!existsSync(xlsxPath)) {
    await downloadXlsx(xlsxPath);
  }
  extractCsvs(xlsxPath, dir);
  assertCofidCsvDir(dir);
  return dir;
}

async function main(): Promise<void> {
  const dir = await ensureCsvDir(cacheDir());
  process.stdout.write(`Reading CoFID 2021 CSVs from ${dir}\n`);
  const dataset = datasetFromCofidDir(dir);
  process.stdout.write(`Converted ${dataset.foods.length} McCance and Widdowson foods\n`);
  const prisma = new PrismaClient();
  try {
    const removed = await replaceCatalogFoods(prisma, "cofid-uk");
    if (removed > 0) process.stdout.write(`Removed ${removed} previous CoFID catalog foods\n`);
    const report = await importFoodDataset(prisma, dataset);
    const withIodine = dataset.foods.filter((f) => f.extraNutrients?.iodineMcg != null).length;
    const withBiotin = dataset.foods.filter((f) => f.extraNutrients?.biotinMcg != null).length;
    process.stdout.write(`Iodine values: ${withIodine}; biotin values: ${withBiotin}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "CoFID import failed"}\n`);
  process.exitCode = 1;
});
