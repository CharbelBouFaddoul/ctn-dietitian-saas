import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FoodsModule } from "../foods/foods.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { RecipeController } from "./recipe.controller";
import { RecipeNutritionService } from "./recipe-nutrition.service";
import { RecipeService } from "./recipe.service";

@Module({
  imports: [AuthModule, DietitianModule, FoodsModule],
  controllers: [RecipeController],
  providers: [RecipeService, RecipeNutritionService],
  exports: [RecipeService, RecipeNutritionService],
})
export class RecipesModule {}
