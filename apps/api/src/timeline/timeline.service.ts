import { Injectable } from "@nestjs/common";
import type { Prisma, TimelineEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantWhere } from "../organizations/tenant-scope";

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    /** DietitianAccount.id (Phase 1 path/tenant id). */
    organizationId: string;
    dietitianAccountId?: string;
    legacyOrganizationId?: string | null;
    clientId: string;
    type: TimelineEventType;
    actorUserId?: string;
    targetType?: string;
    targetId?: string;
    metadata?: Prisma.InputJsonObject;
  }): Promise<void> {
    const dietitianAccountId = input.dietitianAccountId ?? input.organizationId;
    await this.prisma.timelineEvent.create({
      data: {
        dietitianAccountId,
        organizationId: input.legacyOrganizationId ?? dietitianAccountId,
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

  async list(organizationId: string, clientId: string) {
    const events = await this.prisma.timelineEvent.findMany({
      where: { ...tenantWhere(organizationId), clientId },
      orderBy: { occurredAt: "desc" },
      take: 100,
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
