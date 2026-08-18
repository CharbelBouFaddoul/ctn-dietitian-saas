import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { localDateKey, parseLocalDate } from "@nutrition-saas/utilities";
import type { Client, MealLogCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TimelineService } from "../timeline/timeline.service";
import {
  FoodLogNutritionService,
  parseFoodLogNutritionSnapshot,
} from "./food-log-nutrition.service";

@Injectable()
export class TrackingTimezoneService {
  constructor(private readonly prisma: PrismaService) {}

  async timezoneForClient(client: Client): Promise<string> {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: client.organizationId },
      select: { timezone: true },
    });
    return settings?.timezone ?? "UTC";
  }

  trackingDate(instant: Date, timeZone: string): Date {
    return parseLocalDate(localDateKey(instant, timeZone));
  }

  parseTrackingDate(value: string): Date {
    try {
      return parseLocalDate(value);
    } catch {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
  }
}

@Injectable()
export class FoodLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nutrition: FoodLogNutritionService,
    private readonly timezone: TrackingTimezoneService,
    private readonly timeline: TimelineService,
  ) {}

  async listForClient(client: Client, date: string) {
    const trackingDate = this.timezone.parseTrackingDate(date);
    const rows = await this.prisma.foodLog.findMany({
      where: {
        organizationId: client.organizationId,
        clientId: client.id,
        trackingDate,
        status: "ACTIVE",
      },
      orderBy: { consumedAt: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async createForClient(
    client: Client,
    actorUserId: string,
    input: {
      foodId: string;
      quantity: number;
      unit: Prisma.FoodLogCreateInput["unit"];
      consumedAt?: string;
      mealCategory?: MealLogCategory;
      notes?: string;
    },
  ) {
    const consumedAt = input.consumedAt ? new Date(input.consumedAt) : new Date();
    if (Number.isNaN(consumedAt.getTime())) {
      throw new BadRequestException("consumedAt must be a valid timestamp");
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    const snapshot = await this.nutrition.buildSnapshot(
      client.organizationId,
      input.foodId,
      input.quantity,
      input.unit,
    );
    const row = await this.prisma.foodLog.create({
      data: {
        organizationId: client.organizationId,
        clientId: client.id,
        foodId: input.foodId,
        quantity: input.quantity,
        unit: input.unit,
        consumedAt,
        trackingDate: this.timezone.trackingDate(consumedAt, timeZone),
        mealCategory: input.mealCategory ?? null,
        notes: input.notes ?? null,
        nutritionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await this.timeline.record({
      organizationId: client.organizationId,
      clientId: client.id,
      type: "FOOD_LOGGED",
      actorUserId,
      targetType: "food_log",
      targetId: row.id,
    });
    return this.toResponse(row);
  }

  async updateForClient(
    client: Client,
    logId: string,
    input: {
      foodId?: string;
      quantity?: number;
      unit?: Prisma.FoodLogCreateInput["unit"];
      consumedAt?: string;
      mealCategory?: MealLogCategory | null;
      notes?: string | null;
    },
  ) {
    const row = await this.requireActive(client, logId);
    const foodId = input.foodId ?? row.foodId;
    const quantity = input.quantity ?? Number(row.quantity);
    const unit = input.unit ?? row.unit;
    const consumedAt = input.consumedAt ? new Date(input.consumedAt) : row.consumedAt;
    if (Number.isNaN(consumedAt.getTime())) {
      throw new BadRequestException("consumedAt must be a valid timestamp");
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    const snapshot = await this.nutrition.buildSnapshot(client.organizationId, foodId, quantity, unit);
    const updated = await this.prisma.foodLog.update({
      where: { id: row.id },
      data: {
        foodId,
        quantity,
        unit,
        consumedAt,
        trackingDate: this.timezone.trackingDate(consumedAt, timeZone),
        ...(input.mealCategory !== undefined ? { mealCategory: input.mealCategory } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        nutritionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toResponse(updated);
  }

  async archiveForClient(client: Client, logId: string) {
    const row = await this.requireActive(client, logId);
    const updated = await this.prisma.foodLog.update({
      where: { id: row.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return this.toResponse(updated);
  }

  private async requireActive(client: Client, logId: string) {
    const row = await this.prisma.foodLog.findFirst({
      where: {
        id: logId,
        organizationId: client.organizationId,
        clientId: client.id,
        status: "ACTIVE",
      },
    });
    if (!row) {
      throw new NotFoundException("Food log not found");
    }
    return row;
  }

  private toResponse(row: {
    id: string;
    foodId: string;
    quantity: Prisma.Decimal;
    unit: string;
    consumedAt: Date;
    trackingDate: Date;
    mealCategory: MealLogCategory | null;
    notes: string | null;
    nutritionSnapshot: unknown;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const snapshot = parseFoodLogNutritionSnapshot(row.nutritionSnapshot);
    return {
      id: row.id,
      foodId: row.foodId,
      foodName: snapshot.foodName,
      quantity: Number(row.quantity),
      unit: row.unit,
      consumedAt: row.consumedAt.toISOString(),
      trackingDate: row.trackingDate.toISOString().slice(0, 10),
      mealCategory: row.mealCategory,
      notes: row.notes,
      nutrition: snapshot.nutrition,
      presented: snapshot.presented,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
