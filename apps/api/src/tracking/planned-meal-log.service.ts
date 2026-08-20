import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, MealLogCategory } from "@prisma/client";
import type { ExtraNutrients, NutritionValues } from "@nutrition-saas/nutrition";
import { PrismaService } from "../prisma/prisma.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { FoodLogService } from "./food-log.service";
import { FoodLogNutritionService } from "./food-log-nutrition.service";

type SnapshotMealItem = {
  id: string;
  itemType: string;
  quantity: number;
  unit: string;
  food: { id: string; name: string } | null;
  recipe: { id: string; name: string } | null;
  nutrition: NutritionValues;
};

type SnapshotMeal = {
  id: string;
  name: string;
  nutrition: NutritionValues;
  presented?: NutritionValues;
  extraNutrients?: ExtraNutrients;
  items: SnapshotMealItem[];
};

type Snapshot = {
  days?: Array<{ meals?: SnapshotMeal[] }>;
};

function mealCategoryFromName(name: string): MealLogCategory {
  const n = name.toLowerCase();
  if (n.includes("breakfast")) return "BREAKFAST";
  if (n.includes("lunch")) return "LUNCH";
  if (n.includes("dinner")) return "DINNER";
  if (n.includes("snack")) return "SNACK";
  return "OTHER";
}

@Injectable()
export class PlannedMealLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foodLogs: FoodLogService,
    private readonly nutrition: FoodLogNutritionService,
  ) {}

  async logPlannedMeal(
    client: Client,
    actorUserId: string,
    input: {
      mealId: string;
      date?: string;
      servings?: number;
      clientRequestId?: string;
    },
  ) {
    const servings = input.servings ?? 1;
    if (!(servings > 0) || !Number.isFinite(servings)) {
      throw new BadRequestException("Servings must be greater than zero");
    }

    const dietitianAccountId = requireDietitianAccountId(client);
    const version = await this.prisma.mealPlanVersion.findFirst({
      where: {
        status: "PUBLISHED",
        dietitianAccountId,
        mealPlan: {
          clientId: client.id,
          status: { not: "ARCHIVED" },
          dietitianAccountId,
        },
      },
      orderBy: { publishedAt: "desc" },
      select: { id: true, snapshot: true },
    });
    if (!version?.snapshot || typeof version.snapshot !== "object") {
      throw new NotFoundException("No published meal plan found");
    }
    const snapshot = version.snapshot as Snapshot;
    let meal: SnapshotMeal | null = null;
    for (const day of snapshot.days ?? []) {
      for (const candidate of day.meals ?? []) {
        if (candidate.id === input.mealId) {
          meal = candidate;
          break;
        }
      }
      if (meal) break;
    }
    if (!meal) {
      throw new NotFoundException("Meal not found on the published plan");
    }
    if (!meal.items?.length) {
      throw new BadRequestException("Meal has no items to log");
    }
    if (!meal.nutrition) {
      throw new BadRequestException("Meal snapshot is missing nutrition");
    }

    const category = mealCategoryFromName(meal.name);
    const plannedSnapshot = this.nutrition.buildPlannedMealSnapshot({
      mealId: meal.id,
      mealName: meal.name,
      mealPlanVersionId: version.id,
      servingsLogged: servings,
      servingDescription: `${servings} serving${servings === 1 ? "" : "s"}`,
      nutrition: meal.nutrition,
      extraNutrients: meal.extraNutrients,
      items: meal.items.map((item) => ({
        itemType: item.itemType,
        name: item.food?.name ?? item.recipe?.name ?? "Item",
        quantity: item.quantity,
        unit: item.unit,
        nutrition: item.nutrition,
      })),
    });

    const created = await this.foodLogs.createPlannedMealForClient(client, actorUserId, {
      mealId: meal.id,
      mealName: meal.name,
      mealPlanVersionId: version.id,
      servings,
      servingDescription: plannedSnapshot.servingDescription,
      mealCategory: category,
      notes: `From plan: ${meal.name}`,
      clientRequestId: input.clientRequestId,
      snapshot: plannedSnapshot,
      ...(input.date ? { consumedAt: `${input.date}T12:00:00.000Z` } : {}),
    });

    return {
      mealId: meal.id,
      mealName: meal.name,
      servingsLogged: servings,
      created: [created],
      createdCount: 1,
      skippedRecipes: [] as Array<{ id: string; name: string }>,
      skipped: [] as Array<{ reason: string; detail: string }>,
    };
  }
}
