import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { replaceCatalogFoods } from "./catalog-replace";
import { importFoodDataset } from "./importer";
import { assertCnfCsvDir, CNF_CSV_ZIP_URL, datasetFromCnfDir } from "./cnf-dataset";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const CACHE_CANDIDATES = ["food-data/.cnf-cache/2026", "apps/api/food-data/.cnf-cache/2026"];
const ZIP_NAME = "cnf_fcen_all-files-data_2026.zip";
const CSV_FILES = ["Food_Name.csv", "CNF_Food_Group.csv", "Nutrient_Name.csv", "Nutrient_Amount.csv"];

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

async function downloadZip(zipPath: string): Promise<void> {
  process.stdout.write(`Downloading CNF 2026 CSV zip…\n`);
  const response = await fetch(CNF_CSV_ZIP_URL);
  if (!response.ok) {
    throw new Error(
      `CNF 2026 download failed (${response.status}). Save ${ZIP_NAME} under food-data/.cnf-cache/2026/ or pass --dir=`,
    );
  }
  writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
}

function extractCsvs(zipPath: string, dir: string): void {
  process.stdout.write(`Extracting ${zipPath}\n`);
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", dir, ...CSV_FILES], { stdio: "inherit" });
}

async function ensureCsvDir(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  try {
    assertCnfCsvDir(dir);
    return dir;
  } catch {
    /* download / extract */
  }
  const zipPath = argValue("--zip=") ? resolve(process.cwd(), argValue("--zip=")!) : resolve(dir, ZIP_NAME);
  if (!existsSync(zipPath)) {
    await downloadZip(zipPath);
  }
  extractCsvs(zipPath, dir);
  assertCnfCsvDir(dir);
  return dir;
}

async function main(): Promise<void> {
  const dir = await ensureCsvDir(cacheDir());
  process.stdout.write(`Reading CNF 2026 CSVs from ${dir}\n`);
  const dataset = datasetFromCnfDir(dir);
  process.stdout.write(`Converted ${dataset.foods.length} CNF foods\n`);
  const prisma = new PrismaClient();
  try {
    const removed = await replaceCatalogFoods(prisma, "cnf-canada");
    if (removed > 0) process.stdout.write(`Removed ${removed} previous CNF catalog foods\n`);
    const report = await importFoodDataset(prisma, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "CNF import failed"}\n`);
  process.exitCode = 1;
});
