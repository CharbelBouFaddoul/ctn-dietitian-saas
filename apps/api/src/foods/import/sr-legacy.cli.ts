import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { importFoodDataset } from "./importer";
import { datasetFromSrLegacyDump } from "./sr-legacy-dataset";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const SR_LEGACY_JSON_ZIP_URL =
  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip";
const ZIP_NAME = "FoodData_Central_sr_legacy_food_json_2018-04.zip";
const DUMP_NAME = "FoodData_Central_sr_legacy_food_json_2018-04.json";
const CACHE_CANDIDATES = ["food-data/.fdc-cache", "apps/api/food-data/.fdc-cache"];
const DUMP_CANDIDATES = [
  `food-data/.fdc-cache/${DUMP_NAME}`,
  `apps/api/food-data/.fdc-cache/${DUMP_NAME}`,
];

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

function findDumpIn(dir: string): string | null {
  const preferred = resolve(dir, DUMP_NAME);
  if (existsSync(preferred)) return preferred;
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find(
    (name) => name.toLowerCase().includes("sr_legacy") && name.endsWith(".json"),
  );
  return match ? resolve(dir, match) : null;
}

async function ensureDump(): Promise<string> {
  const explicit = argValue("--dump=");
  if (explicit) {
    const path = resolve(process.cwd(), explicit);
    if (!existsSync(path)) throw new Error(`SR Legacy dump not found: ${path}`);
    return path;
  }
  for (const candidate of DUMP_CANDIDATES) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) return path;
  }
  const cached = findDumpIn(cacheDir());
  if (cached) return cached;

  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const zipPath = argValue("--zip=") ? resolve(process.cwd(), argValue("--zip=")!) : resolve(dir, ZIP_NAME);
  if (!existsSync(zipPath)) {
    process.stdout.write("Downloading USDA SR Legacy April 2018 JSON zip…\n");
    const response = await fetch(SR_LEGACY_JSON_ZIP_URL);
    if (!response.ok) {
      throw new Error(
        `SR Legacy download failed (${response.status}). Save ${ZIP_NAME} under food-data/.fdc-cache/ or pass --dump=`,
      );
    }
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }
  process.stdout.write(`Extracting ${zipPath}\n`);
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", dir], { stdio: "inherit" });
  const extracted = findDumpIn(dir);
  if (!extracted) {
    throw new Error(`Expected an SR Legacy JSON file after unzip in ${dir}`);
  }
  return extracted;
}

async function main(): Promise<void> {
  const file = await ensureDump();
  process.stdout.write(`Reading ${file}\n`);
  const dataset = datasetFromSrLegacyDump(file);
  process.stdout.write(`Converted ${dataset.foods.length} SR Legacy foods\n`);
  const prisma = new PrismaClient();
  try {
    const report = await importFoodDataset(prisma, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "SR Legacy import failed"}\n`);
  process.exitCode = 1;
});
