import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { MealItemType, Prisma, QuantityUnit } from "@prisma/client";
import {
  calculateFoodNutrition,
  IncompatibleFoodUnitError,
  roundNutrition,
  scaleNutrition,
  sumNutrition,
  type NutritionValues,
} from "@nutrition-saas/nutrition";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { ClientAccessService } from "../clients/client-access.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { requireDietitianAccountId, tenantWhere } from "../dietitian/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { RecipeNutritionService, isFoodQuantityUnit, type EffectiveFood } from "../recipes/recipe-nutrition.service";
import { RecipeService } from "../recipes/recipe.service";

const DEFAULT_MEALS = ["Breakfast", "Lunch", "Dinner"];

export interface MealPlanSnapshot {
  schemaVersion: 1;
  calculatedAt: string;
  planName: string;
  planDescription: string | null;
  versionNumber: number;
  days: Array<{
    id: string;
    dayNumber: number;
    weekday: string | null;
    title: string | null;
    notes: string | null;
    nutrition: NutritionValues;
    presented: NutritionValues;
    meals: Array<{
      id: string;
      name: string;
      sortOrder: number;
      notes: string | null;
      nutrition: NutritionValues;
      presented: NutritionValues;
      items: Array<{
        id: string;
        itemType: MealItemType;
        quantity: number;
        unit: QuantityUnit;
        notes: string | null;
        food: { id: string; name: string } | null;
        recipe: { id: string; name: string; servings: number } | null;
        nutrition: NutritionValues;
        presented: NutritionValues;
      }>;
    }>;
  }>;
}

type VersionGraph = Prisma.MealPlanVersionGetPayload<{
  include: {
    mealPlan: true;
    days: { include: { meals: { include: { items: true } } } };
  };
}>;

@Injectable()
export class MealPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly recipes: RecipeService,
    private readonly recipeNutrition: RecipeNutritionService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(
    tenant: DietitianTenantContext,
    query: { clientId?: string; status?: "DRAFT" | "ACTIVE" | "ARCHIVED"; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.MealPlanWhereInput = {
      ...tenantWhere(tenant.dietitianAccountId),
      client: this.access.visibleWhere(tenant),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" } }),
    };
    if (query.clientId) {
      await this.access.assertCanAccess(tenant, query.clientId, "read");
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.mealPlan.count({ where }),
      this.prisma.mealPlan.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, displayName: true } },
          versions: { select: { id: true, versionNumber: true, status: true }, orderBy: { versionNumber: "desc" } },
        },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        client: row.client,
        currentPublishedVersion:
          row.versions.find((version) => version.status === "PUBLISHED")?.versionNumber ?? null,
        draftVersion: row.versions.find((version) => version.status === "DRAFT")?.versionNumber ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async create(tenant: DietitianTenantContext, clientId: string, input: { name: string; description?: string | null }) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.mealPlan.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          clientId,
          name: input.name.trim(),
          description: input.description ?? null,
          createdById: tenant.userId,
        },
      });
      const version = await tx.mealPlanVersion.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          mealPlanId: plan.id,
          versionNumber: 1,
          createdById: tenant.userId,
        },
      });
      const day = await tx.mealPlanDay.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          mealPlanVersionId: version.id,
          dayNumber: 1,
          title: "Day 1",
        },
      });
      await tx.meal.createMany({
        data: DEFAULT_MEALS.map((name, index) => ({
          dietitianAccountId: tenant.dietitianAccountId,
          mealPlanDayId: day.id,
          name,
          sortOrder: index,
        })),
      });
      return { plan, version };
    });
    await this.security.record({
      type: "meal_plan_created",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "meal_plan",
      targetId: created.plan.id,
      metadata: { clientId },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId,
      type: "MEAL_PLAN_CREATED",
      actorUserId: tenant.userId,
      targetType: "meal_plan",
      targetId: created.plan.id,
    });
    return this.get(tenant, created.plan.id);
  }

  async get(tenant: DietitianTenantContext, planId: string) {
    const plan = await this.requirePlan(tenant, planId, "read");
    const versions = await this.prisma.mealPlanVersion.findMany({
      where: { mealPlanId: plan.id, ...tenantWhere(tenant.dietitianAccountId) },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, status: true, publishedAt: true, createdAt: true },
    });
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      clientId: plan.clientId,
      versions,
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  async update(tenant: DietitianTenantContext, planId: string, input: { name?: string; description?: string | null }) {
    const plan = await this.requirePlan(tenant, planId, "manageRecords");
    if (plan.status === "ARCHIVED") {
      throw new BadRequestException("Archived meal plans cannot be edited");
    }
    await this.prisma.mealPlan.update({
      where: { id: plan.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    await this.security.record({
      type: "meal_plan_updated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "meal_plan",
      targetId: plan.id,
    });
    return this.get(tenant, plan.id);
  }

  async archive(tenant: DietitianTenantContext, planId: string) {
    const plan = await this.requirePlan(tenant, planId, "manageRecords");
    await this.prisma.mealPlan.update({
      where: { id: plan.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await this.security.record({
      type: "meal_plan_archived",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "meal_plan",
      targetId: plan.id,
    });
    return this.get(tenant, plan.id);
  }

  async getVersion(tenant: DietitianTenantContext, planId: string, versionId: string) {
    const version = await this.requireVersion(tenant, planId, versionId, "read");
    if (version.status !== "DRAFT") {
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt?.toISOString() ?? null,
        immutable: true,
        snapshot: version.snapshot,
      };
    }
    const live = await this.calculateLive(tenant.dietitianAccountId, version);
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      publishedAt: null,
      immutable: false,
      snapshot: live,
    };
  }

  async createDraftVersion(tenant: DietitianTenantContext, planId: string) {
    const plan = await this.requirePlan(tenant, planId, "manageRecords");
    if (plan.status === "ARCHIVED") {
      throw new BadRequestException("Archived meal plans cannot be edited");
    }
    const existingDraft = await this.prisma.mealPlanVersion.findFirst({
      where: { mealPlanId: plan.id, status: "DRAFT", ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (existingDraft) {
      throw new ConflictException("A draft version already exists");
    }
    const latest = await this.prisma.mealPlanVersion.findFirst({
      where: { mealPlanId: plan.id, ...tenantWhere(tenant.dietitianAccountId) },
      orderBy: { versionNumber: "desc" },
      include: { days: { include: { meals: { include: { items: true } } }, orderBy: { dayNumber: "asc" } } },
    });
    if (!latest) {
      throw new NotFoundException("Meal plan version not found");
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.mealPlanVersion.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          mealPlanId: plan.id,
          versionNumber: latest.versionNumber + 1,
          createdById: tenant.userId,
        },
      });
      for (const day of latest.days) {
        const newDay = await tx.mealPlanDay.create({
          data: {
            dietitianAccountId: tenant.dietitianAccountId,
            mealPlanVersionId: version.id,
            dayNumber: day.dayNumber,
            weekday: day.weekday,
            title: day.title,
            notes: day.notes,
          },
        });
        for (const meal of day.meals) {
          const newMeal = await tx.meal.create({
            data: {
              dietitianAccountId: tenant.dietitianAccountId,
              mealPlanDayId: newDay.id,
              name: meal.name,
              sortOrder: meal.sortOrder,
              notes: meal.notes,
            },
          });
          if (meal.items.length > 0) {
            await tx.mealItem.createMany({
              data: meal.items.map((item) => ({
                dietitianAccountId: tenant.dietitianAccountId,
                mealId: newMeal.id,
                itemType: item.itemType,
                foodId: item.foodId,
                recipeId: item.recipeId,
                quantity: item.quantity,
                unit: item.unit,
                sortOrder: item.sortOrder,
                notes: item.notes,
              })),
            });
          }
        }
      }
      return version;
    });
    return this.getVersion(tenant, plan.id, created.id);
  }

  async publish(tenant: DietitianTenantContext, planId: string, versionId: string) {
    const version = await this.requireVersion(tenant, planId, versionId, "manageRecords");
    if (version.status !== "DRAFT") {
      throw new BadRequestException("Only draft versions can be published");
    }
    const snapshot = await this.calculateLive(tenant.dietitianAccountId, version);
    this.assertPublishable(snapshot);

    const published = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.mealPlanVersion.findMany({
        where: { mealPlanId: version.mealPlanId, status: "PUBLISHED", ...tenantWhere(tenant.dietitianAccountId) },
      });
      for (const row of previous) {
        await tx.mealPlanVersion.update({
          where: { id: row.id },
          data: { status: "SUPERSEDED" },
        });
      }
      const next = await tx.mealPlanVersion.update({
        where: { id: version.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.mealPlan.update({
        where: { id: version.mealPlanId },
        data: { status: "ACTIVE" },
      });
      return { next, supersededIds: previous.map((row) => row.id) };
    });

    await this.security.record({
      type: "meal_plan_published",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "meal_plan_version",
      targetId: published.next.id,
      metadata: { mealPlanId: version.mealPlanId, versionNumber: version.versionNumber },
    });
    if (published.supersededIds.length > 0) {
      await this.security.record({
        type: "meal_plan_version_superseded",
        outcome: "success",
        userId: tenant.userId,
        dietitianAccountId: tenant.dietitianAccountId,
        targetType: "meal_plan_version",
        targetId: published.supersededIds[0],
        metadata: { mealPlanId: version.mealPlanId, count: published.supersededIds.length },
      });
    }
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: version.mealPlan.clientId,
      type: "MEAL_PLAN_PUBLISHED",
      actorUserId: tenant.userId,
      targetType: "meal_plan_version",
      targetId: published.next.id,
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async addDay(
    tenant: DietitianTenantContext,
    planId: string,
    versionId: string,
    input: { title?: string | null; weekday?: string | null; notes?: string | null },
  ) {
    const version = await this.assertDraft(tenant, planId, versionId);
    const last = await this.prisma.mealPlanDay.aggregate({
      where: { mealPlanVersionId: version.id },
      _max: { dayNumber: true },
    });
    const day = await this.prisma.mealPlanDay.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        mealPlanVersionId: version.id,
        dayNumber: (last._max.dayNumber ?? 0) + 1,
        title: input.title ?? `Day ${(last._max.dayNumber ?? 0) + 1}`,
        weekday: input.weekday ?? null,
        notes: input.notes ?? null,
      },
    });
    await this.prisma.meal.createMany({
      data: DEFAULT_MEALS.map((name, index) => ({
        dietitianAccountId: tenant.dietitianAccountId,
        mealPlanDayId: day.id,
        name,
        sortOrder: index,
      })),
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async updateDay(
    tenant: DietitianTenantContext,
    planId: string,
    versionId: string,
    dayId: string,
    input: { title?: string | null; weekday?: string | null; notes?: string | null },
  ) {
    await this.assertDraft(tenant, planId, versionId);
    await this.requireDay(tenant.dietitianAccountId, versionId, dayId);
    await this.prisma.mealPlanDay.update({
      where: { id: dayId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.weekday !== undefined ? { weekday: input.weekday } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async deleteDay(tenant: DietitianTenantContext, planId: string, versionId: string, dayId: string) {
    await this.assertDraft(tenant, planId, versionId);
    await this.requireDay(tenant.dietitianAccountId, versionId, dayId);
    await this.prisma.mealPlanDay.delete({ where: { id: dayId } });
    return this.getVersion(tenant, planId, versionId);
  }

  async addMeal(tenant: DietitianTenantContext, planId: string, versionId: string, dayId: string, input: { name: string; notes?: string }) {
    await this.assertDraft(tenant, planId, versionId);
    await this.requireDay(tenant.dietitianAccountId, versionId, dayId);
    const last = await this.prisma.meal.aggregate({
      where: { mealPlanDayId: dayId },
      _max: { sortOrder: true },
    });
    await this.prisma.meal.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        mealPlanDayId: dayId,
        name: input.name.trim(),
        notes: input.notes ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async updateMeal(
    tenant: DietitianTenantContext,
    planId: string,
    versionId: string,
    mealId: string,
    input: { name?: string; notes?: string | null; sortOrder?: number },
  ) {
    await this.assertDraft(tenant, planId, versionId);
    await this.requireMeal(tenant.dietitianAccountId, versionId, mealId);
    await this.prisma.meal.update({
      where: { id: mealId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async deleteMeal(tenant: DietitianTenantContext, planId: string, versionId: string, mealId: string) {
    await this.assertDraft(tenant, planId, versionId);
    await this.requireMeal(tenant.dietitianAccountId, versionId, mealId);
    await this.prisma.meal.delete({ where: { id: mealId } });
    return this.getVersion(tenant, planId, versionId);
  }

  async addItem(
    tenant: DietitianTenantContext,
    planId: string,
    versionId: string,
    mealId: string,
    input: {
      itemType: MealItemType;
      foodId?: string;
      recipeId?: string;
      quantity: number;
      unit: QuantityUnit;
      notes?: string;
    },
  ) {
    await this.assertDraft(tenant, planId, versionId);
    await this.requireMeal(tenant.dietitianAccountId, versionId, mealId);
    await this.validateItem(tenant.dietitianAccountId, input);
    const last = await this.prisma.mealItem.aggregate({
      where: { mealId },
      _max: { sortOrder: true },
    });
    await this.prisma.mealItem.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        mealId,
        itemType: input.itemType,
        foodId: input.itemType === "FOOD" ? input.foodId : null,
        recipeId: input.itemType === "RECIPE" ? input.recipeId : null,
        quantity: input.quantity,
        unit: input.unit,
        notes: input.notes ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async updateItem(
    tenant: DietitianTenantContext,
    planId: string,
    versionId: string,
    itemId: string,
    input: { quantity?: number; unit?: QuantityUnit; notes?: string | null; sortOrder?: number },
  ) {
    await this.assertDraft(tenant, planId, versionId);
    const item = await this.requireItem(tenant.dietitianAccountId, versionId, itemId);
    const quantity = input.quantity ?? Number(item.quantity);
    const unit = input.unit ?? item.unit;
    await this.validateItem(tenant.dietitianAccountId, {
      itemType: item.itemType,
      foodId: item.foodId ?? undefined,
      recipeId: item.recipeId ?? undefined,
      quantity,
      unit,
    });
    await this.prisma.mealItem.update({
      where: { id: item.id },
      data: {
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.getVersion(tenant, planId, versionId);
  }

  async deleteItem(tenant: DietitianTenantContext, planId: string, versionId: string, itemId: string) {
    await this.assertDraft(tenant, planId, versionId);
    const item = await this.requireItem(tenant.dietitianAccountId, versionId, itemId);
    await this.prisma.mealItem.delete({ where: { id: item.id } });
    return this.getVersion(tenant, planId, versionId);
  }

  async portalCurrent(userId: string, activeClientId?: string | null) {
    const client = await this.access.assertPortalAccess(userId, { activeClientId });
    const version = await this.prisma.mealPlanVersion.findFirst({
      where: {
        status: "PUBLISHED",
        dietitianAccountId: requireDietitianAccountId(client),
        mealPlan: { clientId: client.id, status: { not: "ARCHIVED" }, dietitianAccountId: client.dietitianAccountId },
      },
      orderBy: { publishedAt: "desc" },
      include: { mealPlan: { select: { id: true, name: true, description: true } } },
    });
    if (!version || !version.snapshot) {
      return { plan: null };
    }
    return {
      plan: {
        id: version.mealPlan.id,
        name: version.mealPlan.name,
        description: version.mealPlan.description,
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt?.toISOString() ?? null,
        snapshot: version.snapshot,
      },
    };
  }

  private async calculateLive(dietitianAccountId: string, version: VersionGraph): Promise<MealPlanSnapshot> {
    const foodIds = new Set<string>();
    const recipeIds = new Set<string>();
    for (const day of version.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          if (item.foodId) foodIds.add(item.foodId);
          if (item.recipeId) recipeIds.add(item.recipeId);
        }
      }
    }
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: [...recipeIds] }, dietitianAccountId },
      include: { ingredients: true },
    });
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        foodIds.add(ingredient.foodId);
      }
    }
    const foodMap = await this.recipeNutrition.loadFoods(dietitianAccountId, [...foodIds]);
    const recipeMap = new Map(
      await Promise.all(
        recipes.map(async (recipe) => [recipe.id, await this.recipeNutrition.calculate(dietitianAccountId, recipe, recipe.ingredients, foodMap)] as const),
      ),
    );

    const days = version.days
      .slice()
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((day) => {
        const meals = day.meals
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((meal) => {
            const items = meal.items
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => this.itemNutrition(item, foodMap, recipeMap));
            const nutrition = sumNutrition(items.map((row) => row.nutrition));
            return {
              id: meal.id,
              name: meal.name,
              sortOrder: meal.sortOrder,
              notes: meal.notes,
              nutrition,
              presented: roundNutrition(nutrition),
              items,
            };
          });
        const nutrition = sumNutrition(meals.map((row) => row.nutrition));
        return {
          id: day.id,
          dayNumber: day.dayNumber,
          weekday: day.weekday,
          title: day.title,
          notes: day.notes,
          nutrition,
          presented: roundNutrition(nutrition),
          meals,
        };
      });

    return {
      schemaVersion: 1,
      calculatedAt: new Date().toISOString(),
      planName: version.mealPlan.name,
      planDescription: version.mealPlan.description,
      versionNumber: version.versionNumber,
      days,
    };
  }

  private itemNutrition(
    item: VersionGraph["days"][number]["meals"][number]["items"][number],
    foodMap: Map<string, EffectiveFood>,
    recipeMap: Map<string, Awaited<ReturnType<RecipeNutritionService["calculate"]>>>,
  ) {
    if (item.itemType === "FOOD") {
      const food = item.foodId ? foodMap.get(item.foodId) : undefined;
      if (!food || !isFoodQuantityUnit(item.unit)) {
        throw new BadRequestException("Meal item food is not available");
      }
      try {
        const nutrition = calculateFoodNutrition(
          {
            referenceQuantity: food.referenceQuantity,
            referenceUnit: food.referenceUnit,
            nutrition: food.effectiveNutrition,
          },
          Number(item.quantity),
          item.unit,
        );
        return {
          id: item.id,
          itemType: item.itemType,
          quantity: Number(item.quantity),
          unit: item.unit,
          notes: item.notes,
          food: { id: food.id, name: food.name },
          recipe: null,
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
    const recipe = item.recipeId ? recipeMap.get(item.recipeId) : undefined;
    if (!recipe || item.unit !== "serving") {
      throw new BadRequestException("Meal item recipe is not available");
    }
    const nutrition = scaleNutrition(recipe.perServing, Number(item.quantity));
    return {
      id: item.id,
      itemType: item.itemType,
      quantity: Number(item.quantity),
      unit: item.unit,
      notes: item.notes,
      food: null,
      recipe: { id: recipe.recipeId, name: recipe.name, servings: recipe.servings },
      nutrition,
      presented: roundNutrition(nutrition),
    };
  }

  private assertPublishable(snapshot: MealPlanSnapshot) {
    const itemCount = snapshot.days.reduce(
      (sum, day) => sum + day.meals.reduce((mealSum, meal) => mealSum + meal.items.length, 0),
      0,
    );
    if (snapshot.days.length === 0 || itemCount === 0) {
      throw new BadRequestException("A meal plan must include at least one food or recipe before publishing");
    }
  }

  private async validateItem(
    dietitianAccountId: string,
    input: { itemType: MealItemType; foodId?: string; recipeId?: string; quantity: number; unit: QuantityUnit },
  ) {
    if (!(input.quantity > 0)) {
      throw new BadRequestException("Quantity must be greater than zero");
    }
    if (input.itemType === "FOOD") {
      if (!input.foodId || input.recipeId) {
        throw new BadRequestException("Food items must reference a food only");
      }
      if (!isFoodQuantityUnit(input.unit)) {
        throw new BadRequestException("Food items must use a mass or volume unit");
      }
      await this.recipeNutrition.loadFoods(dietitianAccountId, [input.foodId]);
      return;
    }
    if (!input.recipeId || input.foodId) {
      throw new BadRequestException("Recipe items must reference a recipe only");
    }
    if (input.unit !== "serving") {
      throw new BadRequestException("Recipe quantities are servings");
    }
    await this.recipes.requireActive(dietitianAccountId, input.recipeId);
  }

  private async requirePlan(tenant: DietitianTenantContext, planId: string, action: "read" | "manageRecords") {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: planId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!plan) {
      throw new NotFoundException("Meal plan not found");
    }
    await this.access.assertCanAccess(tenant, plan.clientId, action);
    return plan;
  }

  private async requireVersion(tenant: DietitianTenantContext, planId: string, versionId: string, action: "read" | "manageRecords") {
    await this.requirePlan(tenant, planId, action);
    const version = await this.prisma.mealPlanVersion.findFirst({
      where: { id: versionId, mealPlanId: planId, ...tenantWhere(tenant.dietitianAccountId) },
      include: {
        mealPlan: true,
        days: { include: { meals: { include: { items: true } } }, orderBy: { dayNumber: "asc" } },
      },
    });
    if (!version) {
      throw new NotFoundException("Meal plan version not found");
    }
    return version;
  }

  private async assertDraft(tenant: DietitianTenantContext, planId: string, versionId: string) {
    const version = await this.requireVersion(tenant, planId, versionId, "manageRecords");
    if (version.status !== "DRAFT") {
      throw new BadRequestException("Published versions cannot be modified");
    }
    if (version.mealPlan.status === "ARCHIVED") {
      throw new BadRequestException("Archived meal plans cannot be edited");
    }
    return version;
  }

  private async requireDay(dietitianAccountId: string, versionId: string, dayId: string) {
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { id: dayId, mealPlanVersionId: versionId, dietitianAccountId },
    });
    if (!day) {
      throw new NotFoundException("Day not found");
    }
    return day;
  }

  private async requireMeal(dietitianAccountId: string, versionId: string, mealId: string) {
    const meal = await this.prisma.meal.findFirst({
      where: { id: mealId, dietitianAccountId, day: { mealPlanVersionId: versionId } },
    });
    if (!meal) {
      throw new NotFoundException("Meal not found");
    }
    return meal;
  }

  private async requireItem(dietitianAccountId: string, versionId: string, itemId: string) {
    const item = await this.prisma.mealItem.findFirst({
      where: { id: itemId, dietitianAccountId, meal: { day: { mealPlanVersionId: versionId } } },
    });
    if (!item) {
      throw new NotFoundException("Meal item not found");
    }
    return item;
  }
}
