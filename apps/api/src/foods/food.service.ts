import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { FoodOverride, Prisma } from "@prisma/client";
import {
  calculateFoodNutrition,
  IncompatibleFoodUnitError,
  normalizeFoodName,
  roundNutrition,
  mergeNutrition,
  type FoodQuantityUnit,
} from "@nutrition-saas/nutrition";
import { PrismaService } from "../prisma/prisma.service";
import {
  foodIdentity,
  nutritionFromRow,
  overrideNutrition,
  overriddenFields,
  sourcePayload,
} from "./food.mapper";

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    organizationId: string,
    query: {
      q?: string;
      category?: string;
      sourceId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.FoodWhereInput = {
      status: "ACTIVE",
      source: { status: "ACTIVE" },
      ...(query.category ? { category: query.category } : {}),
      ...(query.sourceId ? { foodSourceId: query.sourceId } : {}),
      ...(query.q
        ? {
            OR: [
              { nameNormalized: { contains: normalizeFoodName(query.q), mode: "insensitive" } },
              { name: { contains: query.q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
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

    const overrideRows = await this.prisma.foodOverride.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        foodId: { in: rows.map((row) => row.id) },
      },
      select: { foodId: true },
    });
    const overridden = new Set(overrideRows.map((row) => row.foodId));

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => {
        const nutrition = nutritionFromRow(row);
        return {
          ...foodIdentity(row),
          nutrition,
          presentedNutrition: roundNutrition(nutrition),
          hasOverride: overridden.has(row.id),
          source: { id: row.source.id, name: row.source.name, datasetVersion: row.source.datasetVersion },
        };
      }),
    };
  }

  async getEffective(organizationId: string, foodId: string) {
    const food = await this.loadFood(foodId);
    const override = await this.prisma.foodOverride.findUnique({
      where: { organizationId_foodId: { organizationId, foodId } },
    });
    return this.toEffective(food, override);
  }

  async getEffectiveMany(organizationId: string, foodIds: string[]) {
    const unique = [...new Set(foodIds)];
    if (unique.length === 0) {
      return new Map<string, Awaited<ReturnType<FoodService["getEffective"]>>>();
    }
    const foods = await this.prisma.food.findMany({
      where: { id: { in: unique }, status: "ACTIVE", source: { status: "ACTIVE" } },
      include: { source: true },
    });
    if (foods.length !== unique.length) {
      throw new NotFoundException("Food not found");
    }
    const overrides = await this.prisma.foodOverride.findMany({
      where: { organizationId, foodId: { in: unique } },
    });
    const overrideByFood = new Map(overrides.map((row) => [row.foodId, row]));
    const result = new Map<string, Awaited<ReturnType<FoodService["getEffective"]>>>();
    for (const food of foods) {
      result.set(food.id, this.toEffective(food, overrideByFood.get(food.id) ?? null));
    }
    return result;
  }

  private toEffective(food: Awaited<ReturnType<FoodService["loadFood"]>>, override: FoodOverride | null) {
    const activeOverride = override?.status === "ACTIVE" ? override : null;
    const globalNutrition = nutritionFromRow(food);
    const overrideValues = overrideNutrition(activeOverride);
    const effectiveNutrition = mergeNutrition(globalNutrition, overrideValues);

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
    };
  }

  private async loadFood(foodId: string) {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId, status: "ACTIVE", source: { status: "ACTIVE" } },
      include: { source: true },
    });
    if (!food) {
      throw new NotFoundException("Food not found");
    }
    return food;
  }

  async calculate(organizationId: string, foodId: string, quantity: number, unit: FoodQuantityUnit) {
    const effective = await this.getEffective(organizationId, foodId);
    try {
      const nutrition = calculateFoodNutrition(
        {
          referenceQuantity: effective.referenceQuantity,
          referenceUnit: effective.referenceUnit,
          nutrition: effective.effectiveNutrition,
        },
        quantity,
        unit,
      );
      return {
        foodId,
        quantity,
        unit,
        nutrition,
        presented: roundNutrition(nutrition),
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
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    const counts = await this.prisma.food.groupBy({
      by: ["foodSourceId"],
      where: { status: "ACTIVE" },
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
      orderBy: { name: "asc" },
    });
    const counts = await this.prisma.food.groupBy({
      by: ["foodSourceId"],
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

  async listCategories() {
    const rows = await this.prisma.food.findMany({
      where: { status: "ACTIVE", category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((row) => row.category).filter((value): value is string => !!value);
  }
}
