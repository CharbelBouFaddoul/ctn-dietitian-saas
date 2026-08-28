import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { importFoodDataset } from "../foods/import/importer";
import {
  datasetFromFoundationDump,
  resolveFoundationDumpPath,
} from "../foods/import/foundation-dataset";
import { lebanonFct2021Dataset } from "../foods/import/lebanon-fct-2021-dataset";
import type { FoodDatasetFile } from "../foods/import/dataset.types";
import { importRecipeDataset } from "../recipes/import/importer";
import type { RecipeDatasetFile } from "../recipes/import/dataset.types";

export type CatalogImportMode = "full" | "sample" | "none";

function apiRoot(): string {
  // When run via tsx from apps/api, cwd is apps/api.
  return process.cwd();
}

function loadSampleCatalog(): FoodDatasetFile {
  const filePath = resolve(apiRoot(), "food-data/usda-foundation-sample.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as FoodDatasetFile;
}

export async function importDemoFoodCatalog(
  prisma: PrismaClient,
  mode: CatalogImportMode,
): Promise<{ foods: number; sourceKey: string } | null> {
  if (mode === "none") return null;
  let dataset: FoodDatasetFile;
  if (mode === "full") {
    const dumpPath = resolveFoundationDumpPath();
    if (!dumpPath) {
      throw new Error(
        "USDA Foundation April 2026 dump not found. Run pnpm food:import:foundation first.",
      );
    }
    dataset = datasetFromFoundationDump(dumpPath);
  } else {
    dataset = loadSampleCatalog();
  }
  const report = await importFoodDataset(prisma, dataset);
  const lebanon = await importFoodDataset(prisma, lebanonFct2021Dataset());
  return {
    foods: report.imported + report.updated + lebanon.imported + lebanon.updated,
    sourceKey: dataset.source.key,
  };
}

export async function importDemoRecipes(prisma: PrismaClient): Promise<{ recipes: number } | null> {
  const filePath = resolve(apiRoot(), "recipe-data/myplate-kitchen-starter.json");
  const dataset = JSON.parse(readFileSync(filePath, "utf8")) as RecipeDatasetFile;
  const report = await importRecipeDataset(prisma, dataset);
  if (report.errors.length > 0) {
    process.stderr.write(
      `[demo] recipe import warnings: ${report.errors.slice(0, 5).map((e) => e.message).join("; ")}\n`,
    );
  }
  return { recipes: report.imported + report.updated };
}
