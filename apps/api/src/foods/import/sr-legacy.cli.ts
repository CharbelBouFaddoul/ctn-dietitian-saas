import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { importFoodDataset } from "./importer";
import { datasetFromSrLegacyDump } from "./sr-legacy-dataset";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const DUMP_CANDIDATES = [
  "food-data/.fdc-cache/FoodData_Central_sr_legacy_food_json_2018-04.json",
  "apps/api/food-data/.fdc-cache/FoodData_Central_sr_legacy_food_json_2018-04.json",
];

function dumpPath(): string {
  const flag = process.argv.find((arg) => arg.startsWith("--dump="));
  if (flag) return resolve(process.cwd(), flag.slice("--dump=".length));
  for (const candidate of DUMP_CANDIDATES) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) return path;
  }
  throw new Error(
    "SR Legacy dump not found. Place FoodData_Central_sr_legacy_food_json_2018-04.json under apps/api/food-data/.fdc-cache/ or pass --dump=",
  );
}

async function main(): Promise<void> {
  const file = dumpPath();
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
