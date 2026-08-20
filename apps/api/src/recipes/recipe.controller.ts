import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import {
  CreateRecipeDto,
  ListRecipesQueryDto,
  ReplaceIngredientsDto,
  UpdateRecipeDto,
} from "./dto/recipe.dto";
import { RecipeService } from "./recipe.service";

@ApiTags("recipes")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/recipes")
export class RecipeController {
  constructor(private readonly recipes: RecipeService) {}

  @Get()
  @ApiOperation({ summary: "List organization recipes (server-side search/pagination)" })
  list(@CurrentTenant() tenant: DietitianTenantContext, @Query() query: ListRecipesQueryDto) {
    return this.recipes.list(tenant, query);
  }

  @Post()
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateRecipeDto) {
    return this.recipes.create(tenant, body);
  }

  @Get(":recipeId")
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("recipeId", ParseUUIDPipe) recipeId: string) {
    return this.recipes.get(tenant, recipeId);
  }

  @Patch(":recipeId")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("recipeId", ParseUUIDPipe) recipeId: string,
    @Body() body: UpdateRecipeDto,
  ) {
    return this.recipes.update(tenant, recipeId, body);
  }

  @Post(":recipeId/archive")
  archive(@CurrentTenant() tenant: DietitianTenantContext, @Param("recipeId", ParseUUIDPipe) recipeId: string) {
    return this.recipes.archive(tenant, recipeId);
  }

  @Post(":recipeId/duplicate")
  duplicate(@CurrentTenant() tenant: DietitianTenantContext, @Param("recipeId", ParseUUIDPipe) recipeId: string) {
    return this.recipes.duplicate(tenant, recipeId);
  }

  @Put(":recipeId/ingredients")
  replaceIngredients(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("recipeId", ParseUUIDPipe) recipeId: string,
    @Body() body: ReplaceIngredientsDto,
  ) {
    return this.recipes.replaceIngredients(tenant, recipeId, body.ingredients);
  }
}
