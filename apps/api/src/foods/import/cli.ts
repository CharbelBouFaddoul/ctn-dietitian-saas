import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { importFoodDataset } from "./importer";
import type { FoodDatasetFile } from "./dataset.types";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

async function main(): Promise<void> {
  const fileFlag = process.argv.find((arg) => arg.startsWith("--file="));
  const fileArg =
    (fileFlag ? fileFlag.slice("--file=".length) : undefined) ??
    process.argv.find((arg) => arg.endsWith(".json") && !arg.includes("package")) ??
    "food-data/usda-foundation-curated.json";
  const filePath = resolve(process.cwd(), fileArg);
  const dataset = JSON.parse(readFileSync(filePath, "utf8")) as FoodDatasetFile;
  if (!dataset.source?.key || !Array.isArray(dataset.foods)) {
    throw new Error("Dataset file must include source.key and foods[]");
  }

  const prisma = new PrismaClient();
  try {
    const report = await importFoodDataset(prisma, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
  process.exitCode = 1;
});
