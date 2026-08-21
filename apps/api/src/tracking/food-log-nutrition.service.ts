import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, QuantityUnit } from "@prisma/client";
import {
  calculateFoodNutrition,
  IncompatibleFoodUnitError,
  roundExtraNutrients,
  roundNutrition,
  scaleExtraNutrients,
  scaleNutrition,
  type ExtraNutrients,
  type FoodQuantityUnit,
  type NutritionValues,
} from "@nutrition-saas/nutrition";
import { FoodService } from "../foods/food.service";

const FOOD_UNITS: FoodQuantityUnit[] = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"];

export function isFoodLogUnit(unit: string): unit is FoodQuantityUnit {
  return FOOD_UNITS.includes(unit as FoodQuantityUnit);
}

export interface FoodLogNutritionSnapshotV1 {
  schemaVersion: 1;
  foodId: string;
  foodName: string;
  quantity: number;
  unit: QuantityUnit;
  referenceQuantity: number;
  referenceUnit: "g" | "ml";
  nutrition: NutritionValues;
  presented: NutritionValues;
  capturedAt: string;
}

export interface PlannedMealLogItemSnapshot {
  itemType: string;
  name: string;
  quantity: number;
  unit: string;
  nutrition: NutritionValues;
}

export interface FoodLogNutritionSnapshotV2 {
  schemaVersion: 2;
  sourceType: "PLANNED_MEAL";
  mealId: string;
  mealName: string;
  mealPlanVersionId: string;
  foodName: string;
  servingsLogged: number;
  servingDescription: string | null;
  nutrition: NutritionValues;
  presented: NutritionValues;
  extraNutrients?: ExtraNutrients;
  presentedExtraNutrients?: ExtraNutrients;
  items: PlannedMealLogItemSnapshot[];
  capturedAt: string;
}

export type FoodLogNutritionSnapshot = FoodLogNutritionSnapshotV1 | FoodLogNutritionSnapshotV2;

function asNutritionValues(value: unknown): NutritionValues | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<NutritionValues>;
  if (!("energyKcal" in row)) return null;
  return {
    energyKcal: row.energyKcal ?? null,
    proteinG: row.proteinG ?? null,
    carbohydrateG: row.carbohydrateG ?? null,
    fatG: row.fatG ?? null,
    fiberG: row.fiberG ?? null,
    sugarG: row.sugarG ?? null,
    sodiumMg: row.sodiumMg ?? null,
  };
}

/**
 * Normalize stored JSON into a usable snapshot. Demo/legacy rows sometimes store a bare
 * NutritionValues object (no `nutrition`/`presented` wrappers).
 */
export function parseFoodLogNutritionSnapshot(value: unknown): FoodLogNutritionSnapshot {
  if (!value || typeof value !== "object") {
    const empty = roundNutrition({
      energyKcal: 0,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    });
    return {
      schemaVersion: 1,
      foodId: "",
      foodName: "Food",
      quantity: 0,
      unit: "g",
      referenceQuantity: 100,
      referenceUnit: "g",
      nutrition: empty,
      presented: empty,
      capturedAt: new Date(0).toISOString(),
    };
  }

  const raw = value as Record<string, unknown>;
  const nested = asNutritionValues(raw.nutrition);
  if (nested) {
    const presented = asNutritionValues(raw.presented) ?? roundNutrition(nested);
    return { ...(raw as object), nutrition: nested, presented } as FoodLogNutritionSnapshot;
  }

  // Flat nutrition object stored as the whole snapshot
  const flat = asNutritionValues(raw);
  if (flat && !("schemaVersion" in raw)) {
    const presented = roundNutrition(flat);
    return {
      schemaVersion: 1,
      foodId: typeof raw.foodId === "string" ? raw.foodId : "",
      foodName: typeof raw.foodName === "string" ? raw.foodName : "Food",
      quantity: typeof raw.quantity === "number" ? raw.quantity : 0,
      unit: (typeof raw.unit === "string" ? raw.unit : "g") as QuantityUnit,
      referenceQuantity: 100,
      referenceUnit: "g",
      nutrition: flat,
      presented,
      capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : new Date(0).toISOString(),
    };
  }

  return value as FoodLogNutritionSnapshot;
}

export function foodLogDisplayName(snapshot: FoodLogNutritionSnapshot, fallback?: string | null): string {
  if (snapshot.schemaVersion === 2) return snapshot.mealName || snapshot.foodName;
  return snapshot.foodName || fallback || "Food";
}

@Injectable()
export class FoodLogNutritionService {
  constructor(private readonly foods: FoodService) {}

  async buildSnapshot(
    dietitianAccountId: string,
    foodId: string,
    quantity: number,
    unit: QuantityUnit,
  ): Promise<FoodLogNutritionSnapshotV1> {
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      throw new BadRequestException("Quantity must be greater than zero");
    }
    if (!isFoodLogUnit(unit)) {
      throw new BadRequestException("Food logs must use a mass or volume unit");
    }
    const food = await this.foods.getEffective(dietitianAccountId, foodId);
    try {
      const nutrition = calculateFoodNutrition(
        {
          referenceQuantity: food.referenceQuantity,
          referenceUnit: food.referenceUnit,
          nutrition: food.effectiveNutrition,
        },
        quantity,
        unit,
      );
      return {
        schemaVersion: 1,
        foodId: food.id,
        foodName: food.name,
        quantity,
        unit,
        referenceQuantity: food.referenceQuantity,
        referenceUnit: food.referenceUnit,
        nutrition,
        presented: roundNutrition(nutrition),
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof IncompatibleFoodUnitError || error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  buildPlannedMealSnapshot(input: {
    mealId: string;
    mealName: string;
    mealPlanVersionId: string;
    servingsLogged: number;
    servingDescription?: string | null;
    nutrition: NutritionValues;
    extraNutrients?: ExtraNutrients;
    items: PlannedMealLogItemSnapshot[];
  }): FoodLogNutritionSnapshotV2 {
    if (!(input.servingsLogged > 0) || !Number.isFinite(input.servingsLogged)) {
      throw new BadRequestException("Servings must be greater than zero");
    }
    const nutrition = scaleNutrition(input.nutrition, input.servingsLogged);
    const extraNutrients = input.extraNutrients
      ? scaleExtraNutrients(input.extraNutrients, input.servingsLogged)
      : undefined;
    const items = input.items.map((item) => ({
      ...item,
      nutrition: scaleNutrition(item.nutrition, input.servingsLogged),
    }));
    return {
      schemaVersion: 2,
      sourceType: "PLANNED_MEAL",
      mealId: input.mealId,
      mealName: input.mealName,
      mealPlanVersionId: input.mealPlanVersionId,
      foodName: input.mealName,
      servingsLogged: input.servingsLogged,
      servingDescription: input.servingDescription ?? null,
      nutrition,
      presented: roundNutrition(nutrition),
      ...(extraNutrients
        ? {
            extraNutrients,
            presentedExtraNutrients: roundExtraNutrients(extraNutrients),
          }
        : {}),
      items,
      capturedAt: new Date().toISOString(),
    };
  }

  snapshotNutrition(snapshot: FoodLogNutritionSnapshot): NutritionValues {
    return snapshot.nutrition;
  }
}

export function assertClientOwnsLog(client: Client, dietitianAccountId: string, clientId: string) {
  if (client.dietitianAccountId !== dietitianAccountId || client.id !== clientId) {
    throw new NotFoundException("Log not found");
  }
}
