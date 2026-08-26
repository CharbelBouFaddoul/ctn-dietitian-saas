import { Injectable } from "@nestjs/common";
import type { Prisma, TimelineEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantWhere } from "../dietitian/tenant-scope";

/** Tracking / care events — excludes portal admin, billing, tasks, messaging. */
export const CARE_TIMELINE_TYPES: TimelineEventType[] = [
  "MEASUREMENT_ADDED",
  "FOOD_LOGGED",
  "WATER_LOGGED",
  "EXERCISE_LOGGED",
  "SLEEP_LOGGED",
  "HABIT_COMPLETED",
  "GOAL_CREATED",
  "GOAL_COMPLETED",
  "GOAL_CANCELLED",
  "ASSESSMENT_STARTED",
  "ASSESSMENT_COMPLETED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_UPDATED",
  "APPOINTMENT_COMPLETED",
  "APPOINTMENT_CANCELLED",
  "MEAL_PLAN_CREATED",
  "MEAL_PLAN_PUBLISHED",
];

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    dietitianAccountId: string;
    clientId: string;
    type: TimelineEventType;
    actorUserId?: string;
    targetType?: string;
    targetId?: string;
    metadata?: Prisma.InputJsonObject;
  }): Promise<void> {
    await this.prisma.timelineEvent.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: input.clientId,
        type: input.type,
        actorUserId: input.actorUserId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata,
        occurredAt: new Date(),
      },
    });
  }

  async list(
    dietitianAccountId: string,
    clientId: string,
    options?: { before?: string; date?: string; scope?: "care" | "all"; limit?: number },
  ) {
    const take = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const day = options?.date?.trim();
    const dayMatch = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
    const occurredAt = dayMatch
      ? {
          gte: new Date(`${dayMatch}T00:00:00.000Z`),
          lte: new Date(`${dayMatch}T23:59:59.999Z`),
        }
      : options?.before
        ? { lt: new Date(options.before) }
        : undefined;

    const events = await this.prisma.timelineEvent.findMany({
      where: {
        ...tenantWhere(dietitianAccountId),
        clientId,
        ...(occurredAt ? { occurredAt } : {}),
        ...(options?.scope === "care" ? { type: { in: CARE_TIMELINE_TYPES } } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take,
    });
    return events.map((event) => ({
      id: event.id,
      type: event.type,
      targetType: event.targetType,
      targetId: event.targetId,
      actorUserId: event.actorUserId,
      occurredAt: event.occurredAt.toISOString(),
      metadata: event.metadata,
    }));
  }
}
