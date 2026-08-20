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
    options?: { before?: string; limit?: number },
  ) {
    const take = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const events = await this.prisma.timelineEvent.findMany({
      where: {
        ...tenantWhere(dietitianAccountId),
        clientId,
        ...(options?.before ? { occurredAt: { lt: new Date(options.before) } } : {}),
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
