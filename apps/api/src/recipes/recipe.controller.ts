import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { OrgRoles } from "../organizations/decorators/org-roles.decorator";
import { OrgRolesGuard } from "../organizations/guards/org-roles.guard";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import {
  CreateRecipeDto,
  ListRecipesQueryDto,
  ReplaceIngredientsDto,
  UpdateRecipeDto,
} from "./dto/recipe.dto";
import { RecipeService } from "./recipe.service";

@ApiTags("recipes")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/recipes")
export class RecipeController {
  constructor(private readonly recipes: RecipeService) {}

  @Get()
  @ApiOperation({ summary: "List organization recipes (server-side search/pagination)" })
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListRecipesQueryDto) {
    return this.recipes.list(tenant, query);
  }

  @Post()
  @UseGuards(OrgRolesGuard)
  @OrgRoles("OWNER", "DIETITIAN")
  create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateRecipeDto) {
    return this.recipes.create(tenant, body);
  }

  @Get(":recipeId")
  get(@CurrentTenant() tenant: TenantContext, @Param("recipeId", ParseUUIDPipe) recipeId: string) {
    return this.recipes.get(tenant, recipeId);
  }

  @Patch(":recipeId")
  @UseGuards(OrgRolesGuard)
  @OrgRoles("OWNER", "DIETITIAN")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("recipeId", ParseUUIDPipe) recipeId: string,
    @Body() body: UpdateRecipeDto,
  ) {
    return this.recipes.update(tenant, recipeId, body);
  }

  @Post(":recipeId/archive")
  @UseGuards(OrgRolesGuard)
  @OrgRoles("OWNER", "DIETITIAN")
  archive(@CurrentTenant() tenant: TenantContext, @Param("recipeId", ParseUUIDPipe) recipeId: string) {
    return this.recipes.archive(tenant, recipeId);
  }

  @Post(":recipeId/duplicate")
  @UseGuards(OrgRolesGuard)
  @OrgRoles("OWNER", "DIETITIAN")
  duplicate(@CurrentTenant() tenant: TenantContext, @Param("recipeId", ParseUUIDPipe) recipeId: string) {
    return this.recipes.duplicate(tenant, recipeId);
  }

  @Put(":recipeId/ingredients")
  @UseGuards(OrgRolesGuard)
  @OrgRoles("OWNER", "DIETITIAN")
  replaceIngredients(
    @CurrentTenant() tenant: TenantContext,
    @Param("recipeId", ParseUUIDPipe) recipeId: string,
    @Body() body: ReplaceIngredientsDto,
  ) {
    return this.recipes.replaceIngredients(tenant, recipeId, body.ingredients);
  }
}
