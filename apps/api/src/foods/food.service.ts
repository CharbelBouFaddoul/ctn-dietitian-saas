import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FoodOverride, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import {
  calculateFoodNutrition,
  foodQuantityScaleFactor,
  IncompatibleFoodUnitError,
  normalizeFoodName,
  roundNutrition,
  mergeNutrition,
  sanitizeExtraNutrients,
  scaleExtraNutrients,
  roundExtraNutrients,
  type FoodQuantityUnit,
  type ExtraNutrients,
} from "@nutrition-saas/nutrition";
import { PrismaService } from "../prisma/prisma.service";
import {
  foodIdentity,
  nutritionFromRow,
  nutritionPayloadExtras,
  overrideNutrition,
  overriddenFields,
  sourcePayload,
} from "./food.mapper";
import { importFoodDataset } from "./import/importer";
import type { FoodDatasetFile } from "./import/dataset.types";

export const PRACTICE_CUSTOM_SOURCE_KEY = "practice-custom";
export const CURATED_FOOD_DATASET_RELATIVE = "food-data/usda-foundation-curated.json";

type FoodOrigin = "catalog" | "custom" | "all";

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    dietitianAccountId: string,
    query: {
      q?: string;
      category?: string;
      sourceId?: string;
      origin?: FoodOrigin;
      page?: number;
      pageSize?: number;
      /** Portal logging: catalog only (no practice customs). */
      catalogOnly?: boolean;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const origin: FoodOrigin = query.catalogOnly ? "catalog" : (query.origin ?? "all");
    const ownership: Prisma.FoodWhereInput =
      origin === "catalog"
        ? { dietitianAccountId: null }
        : origin === "custom"
          ? { dietitianAccountId }
          : {
              OR: [{ dietitianAccountId: null }, { dietitianAccountId }],
            };

    const q = query.q?.trim() ?? "";
    const normalized = q ? normalizeFoodName(q) : "";
    const textFilter: Prisma.FoodWhereInput | undefined = q
      ? {
          OR: [
            { nameNormalized: { startsWith: normalized, mode: "insensitive" } },
            { name: { startsWith: q, mode: "insensitive" } },
            { nameNormalized: { contains: normalized, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined;

    const where: Prisma.FoodWhereInput = {
      status: "ACTIVE",
      source: { status: "ACTIVE" },
      AND: [
        ownership,
        ...(textFilter ? [textFilter] : []),
        ...(query.category ? [{ category: query.category }] : []),
        ...(query.sourceId ? [{ foodSourceId: query.sourceId }] : []),
      ],
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.food.count({ where }),
      this.prisma.food.findMany({
        where,
        include: { source: true },
        orderBy: [{ nameNormalized: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Prefer prefix matches when searching.
    const sorted = q
      ? [...rows].sort((a, b) => {
          const aPrefix =
            a.nameNormalized.startsWith(normalized) || a.name.toLowerCase().startsWith(q.toLowerCase())
              ? 0
              : 1;
          const bPrefix =
            b.nameNormalized.startsWith(normalized) || b.name.toLowerCase().startsWith(q.toLowerCase())
              ? 0
              : 1;
          if (aPrefix !== bPrefix) return aPrefix - bPrefix;
          return a.nameNormalized.localeCompare(b.nameNormalized);
        })
      : rows;

    const catalogIds = sorted.filter((row) => !row.dietitianAccountId).map((row) => row.id);
    const overrideRows =
      catalogIds.length === 0
        ? []
        : await this.prisma.foodOverride.findMany({
            where: {
              dietitianAccountId,
              status: "ACTIVE",
              foodId: { in: catalogIds },
            },
            select: { foodId: true },
          });
    const overridden = new Set(overrideRows.map((row) => row.foodId));

    return {
      page,
      pageSize,
      total,
      items: sorted.map((row) => {
        const nutrition = nutritionFromRow(row);
        const isCustom = Boolean(row.dietitianAccountId);
        const extras = nutritionPayloadExtras(row);
        return {
          ...foodIdentity(row),
          origin: isCustom ? ("custom" as const) : ("catalog" as const),
          dietitianAccountId: row.dietitianAccountId,
          nutrition,
          presentedNutrition: roundNutrition(nutrition),
          ...extras,
          hasOverride: !isCustom && overridden.has(row.id),
          source: { id: row.source.id, name: row.source.name, datasetVersion: row.source.datasetVersion },
        };
      }),
    };
  }

  async getEffective(dietitianAccountId: string, foodId: string) {
    const food = await this.loadAccessibleFood(dietitianAccountId, foodId);
    if (food.dietitianAccountId) {
      const nutrition = nutritionFromRow(food);
      const extras = nutritionPayloadExtras(food);
      return {
        ...foodIdentity(food),
        origin: "custom" as const,
        dietitianAccountId: food.dietitianAccountId,
        source: sourcePayload(food.source),
        globalNutrition: nutrition,
        override: null,
        effectiveNutrition: nutrition,
        presentedEffectiveNutrition: roundNutrition(nutrition),
        presentedGlobalNutrition: roundNutrition(nutrition),
        overriddenFields: [] as string[],
        ...extras,
      };
    }
    const override = await this.prisma.foodOverride.findUnique({
      where: { dietitianAccountId_foodId: { dietitianAccountId, foodId } },
    });
    return { ...this.toEffective(food, override), origin: "catalog" as const, dietitianAccountId: null };
  }

  async getEffectiveMany(dietitianAccountId: string, foodIds: string[]) {
    const unique = [...new Set(foodIds)];
    if (unique.length === 0) {
      return new Map<string, Awaited<ReturnType<FoodService["getEffective"]>>>();
    }
    const foods = await this.prisma.food.findMany({
      where: {
        id: { in: unique },
        status: "ACTIVE",
        source: { status: "ACTIVE" },
        OR: [{ dietitianAccountId: null }, { dietitianAccountId }],
      },
      include: { source: true },
    });
    if (foods.length !== unique.length) {
      throw new NotFoundException("Food not found");
    }
    const result = new Map<string, Awaited<ReturnType<FoodService["getEffective"]>>>();
    const catalogIds = foods.filter((f) => !f.dietitianAccountId).map((f) => f.id);
    const overrides =
      catalogIds.length === 0
        ? []
        : await this.prisma.foodOverride.findMany({
            where: { dietitianAccountId, foodId: { in: catalogIds } },
          });
    const overrideByFood = new Map(overrides.map((row) => [row.foodId, row]));
    for (const food of foods) {
      if (food.dietitianAccountId) {
        const nutrition = nutritionFromRow(food);
        result.set(food.id, {
          ...foodIdentity(food),
          origin: "custom",
          dietitianAccountId: food.dietitianAccountId,
          source: sourcePayload(food.source),
          globalNutrition: nutrition,
          override: null,
          effectiveNutrition: nutrition,
          presentedEffectiveNutrition: roundNutrition(nutrition),
          presentedGlobalNutrition: roundNutrition(nutrition),
          overriddenFields: [],
          ...nutritionPayloadExtras(food),
        });
      } else {
        result.set(food.id, {
          ...this.toEffective(food, overrideByFood.get(food.id) ?? null),
          origin: "catalog",
          dietitianAccountId: null,
        });
      }
    }
    return result;
  }

  async createCustom(
    dietitianAccountId: string,
    createdById: string | undefined,
    input: {
      name: string;
      category?: string;
      servingDescription?: string;
      referenceQuantity: number;
      referenceUnit: "g" | "ml";
      energyKcal?: number | null;
      proteinG?: number | null;
      carbohydrateG?: number | null;
      fatG?: number | null;
      fiberG?: number | null;
      sugarG?: number | null;
      sodiumMg?: number | null;
      extraNutrients?: ExtraNutrients | null;
    },
  ) {
    void createdById;
    const source = await this.ensurePracticeCustomSource();
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Name is required");
    if (!(input.referenceQuantity > 0)) throw new BadRequestException("Invalid referenceQuantity");
    const extras = sanitizeExtraNutrients(input.extraNutrients);
    const row = await this.prisma.food.create({
      data: {
        foodSourceId: source.id,
        sourceFoodId: randomUUID(),
        dietitianAccountId,
        name,
        nameNormalized: normalizeFoodName(name),
        category: input.category?.trim() || null,
        servingDescription: input.servingDescription?.trim() || null,
        referenceQuantity: input.referenceQuantity,
        referenceUnit: input.referenceUnit,
        energyKcal: input.energyKcal ?? null,
        proteinG: input.proteinG ?? null,
        carbohydrateG: input.carbohydrateG ?? null,
        fatG: input.fatG ?? null,
        fiberG: input.fiberG ?? null,
        sugarG: input.sugarG ?? null,
        sodiumMg: input.sodiumMg ?? null,
        extraNutrients: extras ? (extras as Prisma.InputJsonValue) : undefined,
        status: "ACTIVE",
        importedAt: new Date(),
      },
      include: { source: true },
    });
    return this.getEffective(dietitianAccountId, row.id);
  }

  async updateCustom(
    dietitianAccountId: string,
    foodId: string,
    input: {
      name?: string;
      category?: string | null;
      servingDescription?: string | null;
      referenceQuantity?: number;
      referenceUnit?: "g" | "ml";
      energyKcal?: number | null;
      proteinG?: number | null;
      carbohydrateG?: number | null;
      fatG?: number | null;
      fiberG?: number | null;
      sugarG?: number | null;
      sodiumMg?: number | null;
      extraNutrients?: ExtraNutrients | null;
    },
  ) {
    const food = await this.requireOwnedCustom(dietitianAccountId, foodId);
    if (input.referenceQuantity !== undefined && !(input.referenceQuantity > 0)) {
      throw new BadRequestException("Invalid referenceQuantity");
    }
    const name = input.name?.trim();
    const extras =
      input.extraNutrients !== undefined ? sanitizeExtraNutrients(input.extraNutrients) : undefined;
    await this.prisma.food.update({
      where: { id: food.id },
      data: {
        ...(name ? { name, nameNormalized: normalizeFoodName(name) } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.servingDescription !== undefined
          ? { servingDescription: input.servingDescription?.trim() || null }
          : {}),
        ...(input.referenceQuantity !== undefined ? { referenceQuantity: input.referenceQuantity } : {}),
        ...(input.referenceUnit !== undefined ? { referenceUnit: input.referenceUnit } : {}),
        ...(input.energyKcal !== undefined ? { energyKcal: input.energyKcal } : {}),
        ...(input.proteinG !== undefined ? { proteinG: input.proteinG } : {}),
        ...(input.carbohydrateG !== undefined ? { carbohydrateG: input.carbohydrateG } : {}),
        ...(input.fatG !== undefined ? { fatG: input.fatG } : {}),
        ...(input.fiberG !== undefined ? { fiberG: input.fiberG } : {}),
        ...(input.sugarG !== undefined ? { sugarG: input.sugarG } : {}),
        ...(input.sodiumMg !== undefined ? { sodiumMg: input.sodiumMg } : {}),
        ...(extras !== undefined
          ? { extraNutrients: extras ? (extras as Prisma.InputJsonValue) : PrismaNamespace.JsonNull }
          : {}),
      },
    });
    return this.getEffective(dietitianAccountId, foodId);
  }

  async archiveCustom(dietitianAccountId: string, foodId: string) {
    const food = await this.requireOwnedCustom(dietitianAccountId, foodId);
    await this.prisma.food.update({
      where: { id: food.id },
      data: { status: "INACTIVE" },
    });
    return { id: food.id, status: "INACTIVE" as const };
  }

  private async requireOwnedCustom(dietitianAccountId: string, foodId: string) {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId },
    });
    if (!food) throw new NotFoundException("Food not found");
    if (!food.dietitianAccountId) {
      // Match prior catalog immutability: no dietitian mutation surface for globals.
      throw new NotFoundException("Food not found");
    }
    if (food.dietitianAccountId !== dietitianAccountId) {
      throw new NotFoundException("Food not found");
    }
    return food;
  }

  private toEffective(food: Awaited<ReturnType<FoodService["loadAccessibleFood"]>>, override: FoodOverride | null) {
    const activeOverride = override?.status === "ACTIVE" ? override : null;
    const globalNutrition = nutritionFromRow(food);
    const overrideValues = overrideNutrition(activeOverride);
    const effectiveNutrition = mergeNutrition(globalNutrition, overrideValues);
    const extras = nutritionPayloadExtras(food);

    return {
      ...foodIdentity(food),
      source: sourcePayload(food.source),
      globalNutrition,
      override: activeOverride
        ? {
            id: activeOverride.id,
            status: activeOverride.status,
            nutrition: overrideValues,
            updatedAt: activeOverride.updatedAt.toISOString(),
          }
        : null,
      effectiveNutrition,
      presentedEffectiveNutrition: roundNutrition(effectiveNutrition),
      presentedGlobalNutrition: roundNutrition(globalNutrition),
      overriddenFields: overriddenFields(overrideValues),
      ...extras,
    };
  }

  private async loadAccessibleFood(dietitianAccountId: string, foodId: string) {
    const food = await this.prisma.food.findFirst({
      where: {
        id: foodId,
        status: "ACTIVE",
        source: { status: "ACTIVE" },
        OR: [{ dietitianAccountId: null }, { dietitianAccountId }],
      },
      include: { source: true },
    });
    if (!food) {
      throw new NotFoundException("Food not found");
    }
    return food;
  }

  async calculate(dietitianAccountId: string, foodId: string, quantity: number, unit: FoodQuantityUnit) {
    const effective = await this.getEffective(dietitianAccountId, foodId);
    try {
      const ref = {
        referenceQuantity: effective.referenceQuantity,
        referenceUnit: effective.referenceUnit as "g" | "ml",
        nutrition: effective.effectiveNutrition,
      };
      const nutrition = calculateFoodNutrition(ref, quantity, unit);
      const extras = scaleExtraNutrients(
        effective.extraNutrients ?? {},
        foodQuantityScaleFactor(ref, quantity, unit),
      );
      return {
        foodId,
        quantity,
        unit,
        nutrition,
        presented: roundNutrition(nutrition),
        extraNutrients: extras,
        presentedExtraNutrients: roundExtraNutrients(extras),
      };
    } catch (error) {
      if (error instanceof IncompatibleFoodUnitError || error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async listSources() {
    const sources = await this.prisma.foodSource.findMany({
      where: { status: "ACTIVE", NOT: { key: PRACTICE_CUSTOM_SOURCE_KEY } },
      orderBy: { name: "asc" },
    });
    const counts = await this.prisma.food.groupBy({
      by: ["foodSourceId"],
      where: { status: "ACTIVE", dietitianAccountId: null },
      _count: { _all: true },
    });
    const countBySource = new Map(counts.map((row) => [row.foodSourceId, row._count._all]));
    return sources.map((source) => ({
      ...sourcePayload(source),
      importedAt: source.importedAt.toISOString(),
      foodCount: countBySource.get(source.id) ?? 0,
    }));
  }

  async adminListSources() {
    const sources = await this.prisma.foodSource.findMany({
      where: { NOT: { key: PRACTICE_CUSTOM_SOURCE_KEY } },
      orderBy: { name: "asc" },
    });
    const counts = await this.prisma.food.groupBy({
      by: ["foodSourceId"],
      where: { dietitianAccountId: null },
      _count: { _all: true },
    });
    const countBySource = new Map(counts.map((row) => [row.foodSourceId, row._count._all]));
    return sources.map((source) => ({
      ...sourcePayload(source),
      status: source.status,
      importedAt: source.importedAt.toISOString(),
      foodCount: countBySource.get(source.id) ?? 0,
      lastImportReport: source.lastImportReport,
    }));
  }

  async adminSearchCatalog(query: {
    q?: string;
    category?: string;
    sourceId?: string;
    page?: number;
    pageSize?: number;
  }) {
    // Catalog-only browse for platform admins (no practice customs, no overrides).
    return this.search("00000000-0000-4000-8000-000000000000", {
      ...query,
      catalogOnly: true,
    });
  }

  async adminImportCuratedDataset() {
    const candidates = [
      resolve(process.cwd(), CURATED_FOOD_DATASET_RELATIVE),
      resolve(process.cwd(), "apps/api", CURATED_FOOD_DATASET_RELATIVE),
      resolve(__dirname, "../../", CURATED_FOOD_DATASET_RELATIVE),
    ];
    let filePath = candidates[0]!;
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
    const dataset = JSON.parse(readFileSync(filePath, "utf8")) as FoodDatasetFile;
    if (!dataset.source?.key || !Array.isArray(dataset.foods)) {
      throw new BadRequestException("Curated dataset is invalid");
    }
    return importFoodDataset(this.prisma, dataset);
  }

  async listCategories(dietitianAccountId?: string) {
    const where: Prisma.FoodWhereInput = {
      status: "ACTIVE",
      category: { not: null },
      ...(dietitianAccountId
        ? { OR: [{ dietitianAccountId: null }, { dietitianAccountId }] }
        : { dietitianAccountId: null }),
    };
    const rows = await this.prisma.food.findMany({
      where,
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((row) => row.category).filter((value): value is string => !!value);
  }

  private async ensurePracticeCustomSource() {
    return this.prisma.foodSource.upsert({
      where: { key: PRACTICE_CUSTOM_SOURCE_KEY },
      update: {},
      create: {
        key: PRACTICE_CUSTOM_SOURCE_KEY,
        name: "Practice custom foods",
        provider: "Dietitian practice",
        datasetVersion: "1",
        license: "Practice-owned. Not a USDA dataset.",
        attribution: "Custom foods created by dietitians for their own practice. Not shared globally.",
        homepage: null,
        importedAt: new Date(),
        status: "ACTIVE",
      },
    });
  }
}
