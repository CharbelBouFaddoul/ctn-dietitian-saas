import type { PrismaClient, QuantityUnit } from "@prisma/client";
import type { RecipeDatasetFile, RecipeDatasetRecord, RecipeImportReport } from "./dataset.types";

const FOOD_SOURCE_KEY = "usda-fdc-foundation-curated";
const UNITS = new Set(["g", "kg", "oz", "lb", "ml", "l", "fl_oz"]);

function validateRecord(record: RecipeDatasetRecord): string | null {
  if (!record.sourceRecipeId?.trim()) return "Missing sourceRecipeId";
  if (!record.name?.trim()) return "Missing name";
  if (!(record.servings > 0) || !Number.isFinite(record.servings)) return "Invalid servings";
  if (!Array.isArray(record.ingredients) || record.ingredients.length === 0) {
    return "At least one ingredient is required";
  }
  for (const item of record.ingredients) {
    if (!item.sourceFoodId?.trim()) return "Ingredient missing sourceFoodId";
    if (!(item.quantity > 0) || !Number.isFinite(item.quantity)) return "Invalid ingredient quantity";
    if (!UNITS.has(item.unit)) return `Invalid ingredient unit: ${item.unit}`;
  }
  return null;
}

export async function importRecipeDataset(
  prisma: PrismaClient,
  dataset: RecipeDatasetFile,
): Promise<RecipeImportReport> {
  const report: RecipeImportReport = {
    sourceKey: dataset.source.key,
    datasetVersion: dataset.source.datasetVersion,
    processed: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const foodSource = await prisma.foodSource.findUnique({ where: { key: FOOD_SOURCE_KEY } });
  if (!foodSource) {
    throw new Error(
      `Food catalog source "${FOOD_SOURCE_KEY}" not found. Run pnpm food:import first.`,
    );
  }

  const foods = await prisma.food.findMany({
    where: { foodSourceId: foodSource.id, dietitianAccountId: null },
    select: { id: true, sourceFoodId: true, referenceUnit: true },
  });
  const foodBySourceId = new Map(foods.map((f) => [f.sourceFoodId, f]));

  for (const record of dataset.recipes) {
    report.processed += 1;
    const validationError = validateRecord(record);
    if (validationError) {
      report.errors.push({ sourceRecipeId: record.sourceRecipeId ?? "(missing)", message: validationError });
      report.skipped += 1;
      continue;
    }

    const resolved: Array<{
      foodId: string;
      quantity: number;
      unit: QuantityUnit;
      displayNote: string | null;
      sortOrder: number;
    }> = [];
    let missingFood: string | null = null;
    let unitMismatch: string | null = null;
    for (let i = 0; i < record.ingredients.length; i += 1) {
      const item = record.ingredients[i]!;
      const food = foodBySourceId.get(item.sourceFoodId);
      if (!food) {
        missingFood = item.sourceFoodId;
        break;
      }
      const massUnits = item.unit === "g" || item.unit === "kg" || item.unit === "oz" || item.unit === "lb";
      const volumeUnits = item.unit === "ml" || item.unit === "l" || item.unit === "fl_oz";
      if ((food.referenceUnit === "g" && !massUnits) || (food.referenceUnit === "ml" && !volumeUnits)) {
        unitMismatch = `${item.sourceFoodId} uses ${item.unit} but food is ${food.referenceUnit}-based`;
        break;
      }
      resolved.push({
        foodId: food.id,
        quantity: item.quantity,
        unit: item.unit as QuantityUnit,
        displayNote: item.displayNote ?? null,
        sortOrder: i,
      });
    }
    if (missingFood) {
      report.errors.push({
        sourceRecipeId: record.sourceRecipeId,
        message: `Food sourceFoodId not found in catalog: ${missingFood}`,
      });
      report.skipped += 1;
      continue;
    }
    if (unitMismatch) {
      report.errors.push({
        sourceRecipeId: record.sourceRecipeId,
        message: `Incompatible ingredient unit: ${unitMismatch}`,
      });
      report.skipped += 1;
      continue;
    }

    try {
      const existing = await prisma.recipe.findFirst({
        where: {
          sourceKey: dataset.source.key,
          sourceRecipeId: record.sourceRecipeId,
          dietitianAccountId: null,
        },
      });

      if (!existing) {
        await prisma.$transaction(async (tx) => {
          const created = await tx.recipe.create({
            data: {
              dietitianAccountId: null,
              sourceKey: dataset.source.key,
              sourceRecipeId: record.sourceRecipeId,
              name: record.name.trim(),
              description: record.description?.trim() || null,
              instructions: record.instructions?.trim() || null,
              servings: record.servings,
              status: "ACTIVE",
            },
          });
          await tx.recipeIngredient.createMany({
            data: resolved.map((row) => ({
              dietitianAccountId: null,
              recipeId: created.id,
              foodId: row.foodId,
              quantity: row.quantity,
              unit: row.unit,
              displayNote: row.displayNote,
              sortOrder: row.sortOrder,
            })),
          });
        });
        report.imported += 1;
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.recipe.update({
            where: { id: existing.id },
            data: {
              name: record.name.trim(),
              description: record.description?.trim() || null,
              instructions: record.instructions?.trim() || null,
              servings: record.servings,
              status: "ACTIVE",
              archivedAt: null,
            },
          });
          await tx.recipeIngredient.deleteMany({ where: { recipeId: existing.id } });
          await tx.recipeIngredient.createMany({
            data: resolved.map((row) => ({
              dietitianAccountId: null,
              recipeId: existing.id,
              foodId: row.foodId,
              quantity: row.quantity,
              unit: row.unit,
              displayNote: row.displayNote,
              sortOrder: row.sortOrder,
            })),
          });
        });
        report.updated += 1;
      }
    } catch (error) {
      report.errors.push({
        sourceRecipeId: record.sourceRecipeId,
        message: error instanceof Error ? error.message : "Import failed",
      });
      report.skipped += 1;
    }
  }

  return report;
}
