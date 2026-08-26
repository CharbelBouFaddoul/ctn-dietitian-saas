import { Injectable } from "@nestjs/common";
import type { Prisma, TimelineEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantWhere } from "../dietitian/tenant-scope";

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
    options?: { before?: string; date?: string; limit?: number },
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
