import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { replaceCatalogFoods } from "./catalog-replace";
import {
  datasetFromFoundationDump,
  FOUNDATION_DUMP_FILENAME,
  FOUNDATION_JSON_ZIP_URL,
  FOUNDATION_SOURCE_KEY,
  resolveFoundationDumpPath,
} from "./foundation-dataset";
import { importFoodDataset } from "./importer";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const CACHE_CANDIDATES = ["food-data/.fdc-cache", "apps/api/food-data/.fdc-cache"];
const ZIP_NAME = "FoodData_Central_foundation_food_json_2026-04-30.zip";

function argValue(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(prefix));
  return flag ? flag.slice(prefix.length) : undefined;
}

function cacheDir(): string {
  for (const candidate of CACHE_CANDIDATES) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) return path;
  }
  return resolve(process.cwd(), CACHE_CANDIDATES[0]!);
}

async function ensureDump(): Promise<string> {
  const explicit = argValue("--dump=");
  const existing = resolveFoundationDumpPath(explicit);
  if (existing) return existing;

  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const zipPath = argValue("--zip=") ? resolve(process.cwd(), argValue("--zip=")!) : resolve(dir, ZIP_NAME);
  if (!existsSync(zipPath)) {
    process.stdout.write("Downloading USDA Foundation Foods April 2026 JSON zip…\n");
    const response = await fetch(FOUNDATION_JSON_ZIP_URL);
    if (!response.ok) {
      throw new Error(
        `Foundation 2026 download failed (${response.status}). Save ${ZIP_NAME} under food-data/.fdc-cache/ or pass --dump=`,
      );
    }
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }
  process.stdout.write(`Extracting ${zipPath}\n`);
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", dir, FOUNDATION_DUMP_FILENAME], { stdio: "inherit" });
  const extracted = resolve(dir, FOUNDATION_DUMP_FILENAME);
  if (!existsSync(extracted)) {
    throw new Error(`Expected ${FOUNDATION_DUMP_FILENAME} after unzip`);
  }
  return extracted;
}

async function main(): Promise<void> {
  const file = await ensureDump();
  process.stdout.write(`Reading ${file}\n`);
  const dataset = datasetFromFoundationDump(file);
  process.stdout.write(`Converted ${dataset.foods.length} Foundation foods\n`);
  const prisma = new PrismaClient();
  try {
    const removed = await replaceCatalogFoods(prisma, FOUNDATION_SOURCE_KEY);
    if (removed > 0) process.stdout.write(`Removed ${removed} previous Foundation catalog foods\n`);
    const report = await importFoodDataset(prisma, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Foundation import failed"}\n`);
  process.exitCode = 1;
});
