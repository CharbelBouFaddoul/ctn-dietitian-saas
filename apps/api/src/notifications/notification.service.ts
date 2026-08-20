import { Injectable } from "@nestjs/common";
import type { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    /** DietitianAccount.id (Phase 1 path/tenant id). */
    organizationId: string;
    dietitianAccountId?: string;
    legacyOrganizationId?: string | null;
    userId: string;
    clientId?: string;
    type: NotificationType;
    title: string;
    body: string;
    targetType?: string;
    targetId?: string;
    metadata?: Prisma.InputJsonObject;
  }) {
    const dietitianAccountId = input.dietitianAccountId ?? input.organizationId;
    return this.prisma.notification.create({
      data: {
        dietitianAccountId,
        organizationId: input.legacyOrganizationId ?? dietitianAccountId,
        userId: input.userId,
        clientId: input.clientId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata,
      },
    });
  }

  async listForUser(userId: string, organizationId?: string, limit = 50) {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(organizationId ? { dietitianAccountId: organizationId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async unreadCount(userId: string, organizationId?: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
        ...(organizationId ? { dietitianAccountId: organizationId } : {}),
      },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!row) return null;
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return this.toResponse(updated);
  }

  private toResponse(row: {
    id: string;
    organizationId: string;
    dietitianAccountId?: string | null;
    userId: string;
    clientId: string | null;
    type: NotificationType;
    title: string;
    body: string;
    targetType: string | null;
    targetId: string | null;
    metadata: unknown;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.dietitianAccountId ?? row.organizationId,
      userId: row.userId,
      clientId: row.clientId,
      type: row.type,
      title: row.title,
      body: row.body,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
