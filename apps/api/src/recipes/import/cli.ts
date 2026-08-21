import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { importRecipeDataset } from "./importer";
import type { RecipeDatasetFile } from "./dataset.types";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

async function main(): Promise<void> {
  const fileFlag = process.argv.find((arg) => arg.startsWith("--file="));
  const fileArg =
    (fileFlag ? fileFlag.slice("--file=".length) : undefined) ??
    process.argv.find((arg) => arg.endsWith(".json") && !arg.includes("package")) ??
    "recipe-data/myplate-kitchen-starter.json";
  const filePath = resolve(process.cwd(), fileArg);
  const dataset = JSON.parse(readFileSync(filePath, "utf8")) as RecipeDatasetFile;
  if (!dataset.source?.key || !Array.isArray(dataset.recipes)) {
    throw new Error("Dataset file must include source.key and recipes[]");
  }

  const prisma = new PrismaClient();
  try {
    const report = await importRecipeDataset(prisma, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
  process.exitCode = 1;
});
