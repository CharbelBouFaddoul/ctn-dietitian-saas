import type { Prisma, PrismaClient } from "@prisma/client";
import {
  isSuspiciousCalorieGap,
  calorieDiscrepancy,
  normalizeFoodName,
  sanitizeExtraNutrients,
} from "@nutrition-saas/nutrition";
import type { FoodDatasetFile, FoodDatasetRecord, ImportReport } from "./dataset.types";

const NUTRIENT_FIELDS = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
] as const;

function parseNutrient(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { ok: false };
  }
  return { ok: true, value };
}

function validateRecord(record: FoodDatasetRecord): string | null {
  if (!record.sourceFoodId || !String(record.sourceFoodId).trim()) {
    return "Missing sourceFoodId";
  }
  if (!record.name || !record.name.trim()) {
    return "Missing name";
  }
  if (!(record.referenceQuantity > 0) || !Number.isFinite(record.referenceQuantity)) {
    return "Invalid referenceQuantity";
  }
  if (record.referenceUnit !== "g" && record.referenceUnit !== "ml") {
    return "Invalid referenceUnit";
  }
  for (const field of NUTRIENT_FIELDS) {
    const parsed = parseNutrient(record[field]);
    if (!parsed.ok) {
      return `Invalid numeric value for ${field}`;
    }
  }
  return null;
}

function nutrientsFrom(record: FoodDatasetRecord) {
  const read = (field: (typeof NUTRIENT_FIELDS)[number]) => {
    const parsed = parseNutrient(record[field]);
    return parsed.ok ? parsed.value : null;
  };
  return {
    energyKcal: read("energyKcal"),
    proteinG: read("proteinG"),
    carbohydrateG: read("carbohydrateG"),
    fatG: read("fatG"),
    fiberG: read("fiberG"),
    sugarG: read("sugarG"),
    sodiumMg: read("sodiumMg"),
  };
}

function countMissing(record: FoodDatasetRecord): number {
  return NUTRIENT_FIELDS.filter((field) => record[field] === undefined || record[field] === null).length;
}

export async function importFoodDataset(prisma: PrismaClient, dataset: FoodDatasetFile): Promise<ImportReport> {
  const now = new Date();
  const report: ImportReport = {
    sourceKey: dataset.source.key,
    datasetVersion: dataset.source.datasetVersion,
    processed: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    duplicateSourceIds: 0,
    missingNutritionFields: 0,
    invalidNumericValues: 0,
    suspiciousCalorieGaps: 0,
    rejections: [],
    suspicious: [],
  };

  const source = await prisma.foodSource.upsert({
    where: { key: dataset.source.key },
    update: {
      name: dataset.source.name,
      provider: dataset.source.provider,
      datasetVersion: dataset.source.datasetVersion,
      license: dataset.source.license,
      attribution: dataset.source.attribution,
      homepage: dataset.source.homepage ?? null,
      importedAt: now,
      status: "ACTIVE",
    },
    create: {
      key: dataset.source.key,
      name: dataset.source.name,
      provider: dataset.source.provider,
      datasetVersion: dataset.source.datasetVersion,
      license: dataset.source.license,
      attribution: dataset.source.attribution,
      homepage: dataset.source.homepage ?? null,
      importedAt: now,
      status: "ACTIVE",
    },
  });

  const seen = new Set<string>();
  const existingRows = await prisma.food.findMany({
    where: { foodSourceId: source.id },
    select: { id: true, sourceFoodId: true },
  });
  const existingBySourceFoodId = new Map(existingRows.map((row) => [row.sourceFoodId, row.id]));
  const toCreate: Array<{ sourceFoodId: string; data: Prisma.FoodCreateManyInput }> = [];
  const toUpdate: Array<{ id: string; data: Prisma.FoodUpdateInput }> = [];

  for (const record of dataset.foods) {
    report.processed += 1;
    const reason = validateRecord(record);
    if (reason) {
      report.rejected += 1;
      if (reason.startsWith("Invalid numeric")) {
        report.invalidNumericValues += 1;
      }
      if (report.rejections.length < 50) {
        report.rejections.push({ sourceFoodId: record.sourceFoodId, reason });
      }
      continue;
    }

    const sourceFoodId = record.sourceFoodId.trim();
    if (seen.has(sourceFoodId)) {
      report.duplicateSourceIds += 1;
      report.skipped += 1;
      continue;
    }
    seen.add(sourceFoodId);

    const nutrition = nutrientsFrom(record);
    report.missingNutritionFields += countMissing(record);

    if (isSuspiciousCalorieGap(nutrition.energyKcal, nutrition)) {
      const gap = calorieDiscrepancy(nutrition.energyKcal, nutrition);
      report.suspiciousCalorieGaps += 1;
      if (gap && nutrition.energyKcal !== null && report.suspicious.length < 50) {
        report.suspicious.push({
          sourceFoodId,
          labeledKcal: nutrition.energyKcal,
          expectedKcal: gap.expectedKcal,
        });
      }
    }

    const extras = (sanitizeExtraNutrients(record.extraNutrients) as Prisma.InputJsonValue | null) ?? undefined;
    const data = {
      name: record.name.trim(),
      nameNormalized: normalizeFoodName(record.name),
      category: record.category?.trim() || null,
      servingDescription: record.servingDescription?.trim() || null,
      referenceQuantity: record.referenceQuantity,
      referenceUnit: record.referenceUnit,
      energyKcal: nutrition.energyKcal,
      proteinG: nutrition.proteinG,
      carbohydrateG: nutrition.carbohydrateG,
      fatG: nutrition.fatG,
      fiberG: nutrition.fiberG,
      sugarG: nutrition.sugarG,
      sodiumMg: nutrition.sodiumMg,
      extraNutrients: extras,
      status: "ACTIVE" as const,
      importedAt: now,
    };

    const existingId = existingBySourceFoodId.get(sourceFoodId);
    if (existingId) {
      toUpdate.push({ id: existingId, data });
    } else {
      toCreate.push({
        sourceFoodId,
        data: { foodSourceId: source.id, sourceFoodId, ...data },
      });
    }
  }

  const CREATE_BATCH = 200;
  for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
    const chunk = toCreate.slice(i, i + CREATE_BATCH);
    await prisma.food.createMany({ data: chunk.map((row) => row.data) });
    report.imported += chunk.length;
  }

  for (const row of toUpdate) {
    await prisma.food.update({ where: { id: row.id }, data: row.data });
    report.updated += 1;
  }

  await prisma.foodSource.update({
    where: { id: source.id },
    data: {
      lastImportReport: report as unknown as Prisma.InputJsonValue,
      importedAt: now,
    },
  });

  return report;
}
