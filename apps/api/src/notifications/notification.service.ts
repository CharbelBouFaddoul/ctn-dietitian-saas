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

  async markAllRead(userId: string, organizationId?: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(organizationId ? { dietitianAccountId: organizationId } : {}),
      },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * Emit SUBSCRIPTION_* once per (account, accessState, periodEnd) to avoid spam
   * when access is re-derived on each request.
   */
  async notifySubscriptionAccessIfNeeded(input: {
    dietitianAccountId: string;
    accessState: "ACTIVE" | "GRACE" | "READ_ONLY" | "LOCKED";
    currentPeriodEnd: Date | null;
  }): Promise<void> {
    const type =
      input.accessState === "GRACE"
        ? "SUBSCRIPTION_GRACE"
        : input.accessState === "READ_ONLY"
          ? "SUBSCRIPTION_READ_ONLY"
          : input.accessState === "LOCKED"
            ? "SUBSCRIPTION_LOCKED"
            : null;
    if (!type) return;

    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: input.dietitianAccountId },
      select: { userId: true, legacyOrganizationId: true },
    });
    if (!account) return;

    const periodEndKey = input.currentPeriodEnd?.toISOString() ?? "none";
    const existing = await this.prisma.notification.findFirst({
      where: {
        dietitianAccountId: input.dietitianAccountId,
        userId: account.userId,
        type,
        metadata: { path: ["periodEnd"], equals: periodEndKey },
      },
    });
    if (existing) return;

    const titles = {
      SUBSCRIPTION_GRACE: "Subscription in grace period",
      SUBSCRIPTION_READ_ONLY: "Practice is read-only",
      SUBSCRIPTION_LOCKED: "Practice is locked",
    } as const;
    const bodies = {
      SUBSCRIPTION_GRACE: "Your subscription period ended. Contact an administrator to renew while grace remains.",
      SUBSCRIPTION_READ_ONLY: "Your practice is read-only until the subscription is renewed.",
      SUBSCRIPTION_LOCKED: "Your practice is locked. Contact an administrator to restore access.",
    } as const;

    await this.create({
      organizationId: input.dietitianAccountId,
      legacyOrganizationId: account.legacyOrganizationId,
      userId: account.userId,
      type,
      title: titles[type],
      body: bodies[type],
      targetType: "subscription",
      targetId: input.dietitianAccountId,
      metadata: { periodEnd: periodEndKey, accessState: input.accessState },
    });
  }

  async listRecentPreferUnread(userId: string, organizationId: string, limit = 5) {
    const unread = await this.prisma.notification.findMany({
      where: { userId, dietitianAccountId: organizationId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    if (unread.length >= limit) {
      return unread.map((row) => this.toResponse(row));
    }
    const rest = await this.prisma.notification.findMany({
      where: {
        userId,
        dietitianAccountId: organizationId,
        id: { notIn: unread.map((row) => row.id) },
      },
      orderBy: { createdAt: "desc" },
      take: limit - unread.length,
    });
    return [...unread, ...rest].map((row) => this.toResponse(row));
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
