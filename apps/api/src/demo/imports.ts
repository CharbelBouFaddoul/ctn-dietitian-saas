import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { importFoodDataset } from "../foods/import/importer";
import type { FoodDatasetFile } from "../foods/import/dataset.types";
import { importRecipeDataset } from "../recipes/import/importer";
import type { RecipeDatasetFile } from "../recipes/import/dataset.types";

export type CatalogImportMode = "full" | "sample" | "none";

function apiRoot(): string {
  // When run via tsx from apps/api, cwd is apps/api.
  return process.cwd();
}

export async function importDemoFoodCatalog(
  prisma: PrismaClient,
  mode: CatalogImportMode,
): Promise<{ foods: number; sourceKey: string } | null> {
  if (mode === "none") return null;
  const relative =
    mode === "full" ? "food-data/usda-foundation-curated.json" : "food-data/usda-foundation-sample.json";
  const filePath = resolve(apiRoot(), relative);
  const dataset = JSON.parse(readFileSync(filePath, "utf8")) as FoodDatasetFile;
  const report = await importFoodDataset(prisma, dataset);
  return { foods: report.imported + report.updated, sourceKey: dataset.source.key };
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
