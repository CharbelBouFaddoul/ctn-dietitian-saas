import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, MealLogCategory, QuantityUnit } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { FoodLogService } from "./food-log.service";

const FOOD_UNITS = new Set(["g", "kg", "oz", "lb", "ml", "l", "fl_oz"]);

type SnapshotMealItem = {
  id: string;
  itemType: string;
  quantity: number;
  unit: string;
  food: { id: string; name: string } | null;
  recipe: { id: string; name: string } | null;
};

type SnapshotMeal = {
  id: string;
  name: string;
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
  ) {}

  async logPlannedMeal(
    client: Client,
    actorUserId: string,
    input: { mealId: string; date?: string },
  ) {
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
      select: { snapshot: true },
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

    const category = mealCategoryFromName(meal.name);
    const created: Array<Awaited<ReturnType<FoodLogService["createForClient"]>>> = [];
    const skippedRecipes: Array<{ id: string; name: string }> = [];
    const skipped: Array<{ reason: string; detail: string }> = [];

    for (const item of meal.items ?? []) {
      if (item.itemType === "RECIPE") {
        skippedRecipes.push({
          id: item.recipe?.id ?? item.id,
          name: item.recipe?.name ?? "Recipe",
        });
        continue;
      }
      if (item.itemType !== "FOOD" || !item.food?.id) {
        skipped.push({ reason: "unsupported_item", detail: item.id });
        continue;
      }
      if (!FOOD_UNITS.has(item.unit)) {
        skipped.push({
          reason: "unsupported_unit",
          detail: `${item.food.name} (${item.unit})`,
        });
        continue;
      }
      const log = await this.foodLogs.createForClient(client, actorUserId, {
        foodId: item.food.id,
        quantity: item.quantity,
        unit: item.unit as QuantityUnit,
        mealCategory: category,
        notes: `From plan: ${meal.name}`,
        ...(input.date ? { consumedAt: `${input.date}T12:00:00.000Z` } : {}),
      });
      created.push(log);
    }

    if (created.length === 0 && skippedRecipes.length === 0 && skipped.length === 0) {
      throw new BadRequestException("Meal has no items to log");
    }

    return {
      mealId: meal.id,
      mealName: meal.name,
      created,
      createdCount: created.length,
      skippedRecipes,
      skipped,
    };
  }
}
