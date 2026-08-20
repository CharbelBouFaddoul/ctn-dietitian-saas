import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, QuantityUnit } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { legacyOrganizationId, tenantWhere } from "../organizations/tenant-scope";
import { RecipeNutritionService } from "./recipe-nutrition.service";
import { isFoodQuantityUnit } from "./recipe-nutrition.service";

export interface RecipeWriteInput {
  name?: string;
  description?: string | null;
  instructions?: string | null;
  servings?: number;
}

export interface IngredientWriteInput {
  foodId: string;
  quantity: number;
  unit: QuantityUnit;
  displayNote?: string | null;
  sortOrder?: number;
}

@Injectable()
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nutrition: RecipeNutritionService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(
    tenant: TenantContext,
    query: { q?: string; status?: "ACTIVE" | "ARCHIVED"; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RecipeWhereInput = {
      ...tenantWhere(tenant.organizationId),
      ...(query.status ? { status: query.status } : { status: "ACTIVE" }),
      ...(query.q ? { name: { contains: query.q.trim(), mode: "insensitive" } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.recipe.count({ where }),
      this.prisma.recipe.findMany({
        where,
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { ingredients: true } } },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        servings: Number(row.servings),
        status: row.status,
        ingredientCount: row._count.ingredients,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async get(tenant: TenantContext, recipeId: string) {
    const recipe = await this.requireRecipe(tenant.organizationId, recipeId);
    const ingredients = await this.prisma.recipeIngredient.findMany({
      where: { recipeId, ...tenantWhere(tenant.organizationId) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const calculated = await this.nutrition.calculate(tenant.organizationId, recipe, ingredients);
    return {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      instructions: recipe.instructions,
      servings: Number(recipe.servings),
      status: recipe.status,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
      archivedAt: recipe.archivedAt?.toISOString() ?? null,
      nutrition: calculated,
    };
  }

  async create(tenant: TenantContext, input: RecipeWriteInput & { name: string; servings: number }) {
    this.assertCanManage(tenant);
    this.assertServings(input.servings);
    const recipe = await this.prisma.recipe.create({
      data: {
        dietitianAccountId: tenant.organizationId,
        organizationId: legacyOrganizationId(tenant),
        name: input.name.trim(),
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        servings: input.servings,
        createdById: tenant.userId,
      },
    });
    await this.security.record({
      type: "recipe_created",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "recipe",
      targetId: recipe.id,
      metadata: { name: recipe.name },
    });
    return this.get(tenant, recipe.id);
  }

  async update(tenant: TenantContext, recipeId: string, input: RecipeWriteInput) {
    this.assertCanManage(tenant);
    const recipe = await this.requireRecipe(tenant.organizationId, recipeId);
    if (recipe.status === "ARCHIVED") {
      throw new BadRequestException("Archived recipes cannot be edited");
    }
    if (input.servings !== undefined) {
      this.assertServings(input.servings);
    }
    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.servings !== undefined ? { servings: input.servings } : {}),
      },
    });
    await this.security.record({
      type: "recipe_updated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "recipe",
      targetId: recipe.id,
    });
    return this.get(tenant, recipe.id);
  }

  async archive(tenant: TenantContext, recipeId: string) {
    this.assertCanManage(tenant);
    const recipe = await this.requireRecipe(tenant.organizationId, recipeId);
    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await this.security.record({
      type: "recipe_archived",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "recipe",
      targetId: recipe.id,
    });
    return this.get(tenant, recipe.id);
  }

  async duplicate(tenant: TenantContext, recipeId: string) {
    this.assertCanManage(tenant);
    const recipe = await this.requireRecipe(tenant.organizationId, recipeId);
    const ingredients = await this.prisma.recipeIngredient.findMany({
      where: { recipeId: recipe.id, ...tenantWhere(tenant.organizationId) },
      orderBy: { sortOrder: "asc" },
    });
    const copy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.recipe.create({
        data: {
          dietitianAccountId: tenant.organizationId,
          organizationId: legacyOrganizationId(tenant),
          name: `${recipe.name} (copy)`,
          description: recipe.description,
          instructions: recipe.instructions,
          servings: recipe.servings,
          createdById: tenant.userId,
        },
      });
      if (ingredients.length > 0) {
        await tx.recipeIngredient.createMany({
          data: ingredients.map((row) => ({
            dietitianAccountId: tenant.organizationId,
            organizationId: legacyOrganizationId(tenant),
            recipeId: created.id,
            foodId: row.foodId,
            quantity: row.quantity,
            unit: row.unit,
            displayNote: row.displayNote,
            sortOrder: row.sortOrder,
          })),
        });
      }
      return created;
    });
    await this.security.record({
      type: "recipe_created",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "recipe",
      targetId: copy.id,
      metadata: { duplicatedFrom: recipe.id },
    });
    return this.get(tenant, copy.id);
  }

  async replaceIngredients(tenant: TenantContext, recipeId: string, items: IngredientWriteInput[]) {
    this.assertCanManage(tenant);
    const recipe = await this.requireRecipe(tenant.organizationId, recipeId);
    if (recipe.status === "ARCHIVED") {
      throw new BadRequestException("Archived recipes cannot be edited");
    }
    for (const item of items) {
      if (!(item.quantity > 0)) {
        throw new BadRequestException("Ingredient quantity must be greater than zero");
      }
      if (!isFoodQuantityUnit(item.unit)) {
        throw new BadRequestException("Recipe ingredients must use a mass or volume unit");
      }
    }
    const foodIds = [...new Set(items.map((item) => item.foodId))];
    await this.nutrition.loadFoods(tenant.organizationId, foodIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({
        where: { recipeId: recipe.id, ...tenantWhere(tenant.organizationId) },
      });
      if (items.length > 0) {
        await tx.recipeIngredient.createMany({
          data: items.map((item, index) => ({
            dietitianAccountId: tenant.organizationId,
            organizationId: legacyOrganizationId(tenant),
            recipeId: recipe.id,
            foodId: item.foodId,
            quantity: item.quantity,
            unit: item.unit,
            displayNote: item.displayNote ?? null,
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }
    });
    await this.security.record({
      type: "recipe_updated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "recipe",
      targetId: recipe.id,
      metadata: { fields: ["ingredients"] },
    });
    return this.get(tenant, recipe.id);
  }

  async requireActive(organizationId: string, recipeId: string) {
    const recipe = await this.requireRecipe(organizationId, recipeId);
    if (recipe.status !== "ACTIVE") {
      throw new BadRequestException("Archived recipes cannot be used in new meal plans");
    }
    return recipe;
  }

  async requireRecipe(organizationId: string, recipeId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, ...tenantWhere(organizationId) },
    });
    if (!recipe) {
      throw new NotFoundException("Recipe not found");
    }
    return recipe;
  }

  private assertCanManage(_tenant: TenantContext) {
  }

  private assertServings(servings: number) {
    if (!(servings > 0) || !Number.isFinite(servings)) {
      throw new BadRequestException("Recipe servings must be greater than zero");
    }
  }
}
