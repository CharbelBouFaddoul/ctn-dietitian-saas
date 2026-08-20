import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, QuantityUnit } from "@prisma/client";
import {
  calculateFoodNutrition,
  IncompatibleFoodUnitError,
  roundNutrition,
  type FoodQuantityUnit,
  type NutritionValues,
} from "@nutrition-saas/nutrition";
import { FoodService } from "../foods/food.service";

const FOOD_UNITS: FoodQuantityUnit[] = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"];

export function isFoodLogUnit(unit: string): unit is FoodQuantityUnit {
  return FOOD_UNITS.includes(unit as FoodQuantityUnit);
}

export interface FoodLogNutritionSnapshot {
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

export function parseFoodLogNutritionSnapshot(value: unknown): FoodLogNutritionSnapshot {
  return value as FoodLogNutritionSnapshot;
}

@Injectable()
export class FoodLogNutritionService {
  constructor(private readonly foods: FoodService) {}

  async buildSnapshot(
    dietitianAccountId: string,
    foodId: string,
    quantity: number,
    unit: QuantityUnit,
  ): Promise<FoodLogNutritionSnapshot> {
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

  snapshotNutrition(snapshot: FoodLogNutritionSnapshot): NutritionValues {
    return snapshot.nutrition;
  }
}

export function assertClientOwnsLog(client: Client, dietitianAccountId: string, clientId: string) {
  if (client.dietitianAccountId !== dietitianAccountId || client.id !== clientId) {
    throw new NotFoundException("Log not found");
  }
}
