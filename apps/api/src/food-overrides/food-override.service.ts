import { Injectable, NotFoundException } from "@nestjs/common";
import { NUTRIENT_KEYS, type NutritionValues } from "@nutrition-saas/nutrition";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { FoodService } from "../foods/food.service";

export type OverrideInput = Partial<NutritionValues>;

@Injectable()
export class FoodOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foods: FoodService,
    private readonly security: SecurityEventLogger,
  ) {}

  async upsert(tenant: DietitianTenantContext, foodId: string, input: OverrideInput) {
    await this.requireCatalogFood(foodId);

    const data = this.nutrientData(input);
    const existing = await this.prisma.foodOverride.findUnique({
      where: {
        dietitianAccountId_foodId: { dietitianAccountId: tenant.dietitianAccountId, foodId },
      },
    });

    const row = existing
      ? await this.prisma.foodOverride.update({
          where: { id: existing.id },
          data: { ...data, status: "ACTIVE", deactivatedAt: null },
        })
      : await this.prisma.foodOverride.create({
          data: {
            dietitianAccountId: tenant.dietitianAccountId,
            foodId,
            createdById: tenant.userId,
            ...data,
          },
        });

    await this.security.record({
      type: existing ? "food_override_updated" : "food_override_created",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "food_override",
      targetId: row.id,
      metadata: { foodId, fields: Object.keys(input) },
    });

    return this.foods.getEffective(tenant.dietitianAccountId, foodId);
  }

  async remove(tenant: DietitianTenantContext, foodId: string) {
    const existing = await this.prisma.foodOverride.findUnique({
      where: {
        dietitianAccountId_foodId: { dietitianAccountId: tenant.dietitianAccountId, foodId },
      },
    });
    if (!existing) {
      throw new NotFoundException("Override not found");
    }
    await this.prisma.foodOverride.update({
      where: { id: existing.id },
      data: { status: "INACTIVE", deactivatedAt: new Date() },
    });
    await this.security.record({
      type: "food_override_removed",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "food_override",
      targetId: existing.id,
      metadata: { foodId },
    });
    return this.foods.getEffective(tenant.dietitianAccountId, foodId);
  }

  private async requireCatalogFood(foodId: string) {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId, status: "ACTIVE", dietitianAccountId: null },
    });
    if (!food) {
      throw new NotFoundException("Food not found");
    }
    return food;
  }

  private nutrientData(input: OverrideInput) {
    const data: Partial<Record<(typeof NUTRIENT_KEYS)[number], number | null>> = {};
    for (const key of NUTRIENT_KEYS) {
      if (input[key] !== undefined) {
        data[key] = input[key] ?? null;
      }
    }
    return data;
  }
}
