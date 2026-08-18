import { BadRequestException, Injectable } from "@nestjs/common";
import type { QuantityUnit, Recipe, RecipeIngredient } from "@prisma/client";
import {
  calculateFoodNutrition,
  IncompatibleFoodUnitError,
  roundNutrition,
  scaleNutrition,
  sumNutrition,
  type FoodQuantityUnit,
  type NutritionValues,
} from "@nutrition-saas/nutrition";
import { FoodService } from "../foods/food.service";

export type EffectiveFood = Awaited<ReturnType<FoodService["getEffective"]>>;

const FOOD_UNITS: FoodQuantityUnit[] = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"];

export function isFoodQuantityUnit(unit: string): unit is FoodQuantityUnit {
  return FOOD_UNITS.includes(unit as FoodQuantityUnit);
}

export interface RecipeIngredientNutrition {
  id: string;
  foodId: string;
  foodName: string;
  quantity: number;
  unit: QuantityUnit;
  displayNote: string | null;
  sortOrder: number;
  nutrition: NutritionValues;
  presented: NutritionValues;
}

export interface RecipeNutritionResult {
  recipeId: string;
  name: string;
  servings: number;
  status: string;
  ingredients: RecipeIngredientNutrition[];
  total: NutritionValues;
  perServing: NutritionValues;
  presentedTotal: NutritionValues;
  presentedPerServing: NutritionValues;
}

@Injectable()
export class RecipeNutritionService {
  constructor(private readonly foods: FoodService) {}

  loadFoods(organizationId: string, foodIds: string[]) {
    return this.foods.getEffectiveMany(organizationId, foodIds);
  }

  async calculate(
    organizationId: string,
    recipe: Recipe,
    ingredients: RecipeIngredient[],
    foodMap?: Map<string, EffectiveFood>,
  ): Promise<RecipeNutritionResult> {
    const servings = Number(recipe.servings);
    if (!(servings > 0)) {
      throw new BadRequestException("Recipe servings must be greater than zero");
    }
    const ids = ingredients.map((row) => row.foodId);
    const resolved = foodMap ?? (await this.foods.getEffectiveMany(organizationId, ids));
    const calculated = ingredients
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((ingredient) => this.ingredientNutrition(ingredient, resolved));
    const total = sumNutrition(calculated.map((row) => row.nutrition));
    const perServing = scaleNutrition(total, 1 / servings);
    return {
      recipeId: recipe.id,
      name: recipe.name,
      servings,
      status: recipe.status,
      ingredients: calculated,
      total,
      perServing,
      presentedTotal: roundNutrition(total),
      presentedPerServing: roundNutrition(perServing),
    };
  }

  ingredientNutrition(
    ingredient: RecipeIngredient,
    foodMap: Map<string, EffectiveFood>,
  ): RecipeIngredientNutrition {
    const food = foodMap.get(ingredient.foodId);
    if (!food) {
      throw new BadRequestException("Recipe ingredient food is not available");
    }
    const unit = ingredient.unit;
    if (!isFoodQuantityUnit(unit)) {
      throw new BadRequestException("Recipe ingredients must use a mass or volume unit");
    }
    try {
      const nutrition = calculateFoodNutrition(
        {
          referenceQuantity: food.referenceQuantity,
          referenceUnit: food.referenceUnit,
          nutrition: food.effectiveNutrition,
        },
        Number(ingredient.quantity),
        unit,
      );
      return {
        id: ingredient.id,
        foodId: food.id,
        foodName: food.name,
        quantity: Number(ingredient.quantity),
        unit,
        displayNote: ingredient.displayNote,
        sortOrder: ingredient.sortOrder,
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
}
