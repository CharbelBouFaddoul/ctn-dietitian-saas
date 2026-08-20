import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, Conversation } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TimelineService } from "../timeline/timeline.service";
import { NotificationService } from "../notifications/notification.service";
const PREVIEW_MAX = 120;

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationService,
  ) {}

  async getOrCreate(client: Client): Promise<Conversation> {
    const dietitianAccountId = client.dietitianAccountId ?? client.organizationId;
    const existing = await this.prisma.conversation.findUnique({
      where: {
        dietitianAccountId_clientId: {
          dietitianAccountId,
          clientId: client.id,
        },
      },
    });
    if (existing) return existing;
    return this.prisma.conversation.create({
      data: {
        dietitianAccountId,
        organizationId: client.organizationId,
        clientId: client.id,
      },
    });
  }

  async getForClient(client: Client, conversationId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        dietitianAccountId: client.dietitianAccountId ?? client.organizationId,
        clientId: client.id,
      },
    });
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }
    return conversation;
  }

  async listInbox(organizationId: string, clientIds: string[]) {
    if (clientIds.length === 0) return [];
    const rows = await this.prisma.conversation.findMany({
      where: { dietitianAccountId: organizationId, clientId: { in: clientIds }, status: "ACTIVE" },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      include: {
        client: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
      status: row.status,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: row.lastMessagePreview,
    }));
  }

  async sendMessage(input: {
    conversation: Conversation;
    client: Client;
    senderUserId: string;
    body: string;
    notifyUserIds: string[];
    senderIsClient: boolean;
  }) {
    const trimmed = input.body.trim();
    if (!trimmed) {
      throw new BadRequestException("Message body is required");
    }
    if (trimmed.length > 10_000) {
      throw new BadRequestException("Message is too long");
    }
    if (input.conversation.status !== "ACTIVE") {
      throw new ForbiddenException("Conversation is not active");
    }

    const dietitianAccountId = input.client.dietitianAccountId ?? input.client.organizationId;
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          dietitianAccountId,
          organizationId: input.client.organizationId,
          clientId: input.client.id,
          conversationId: input.conversation.id,
          senderUserId: input.senderUserId,
          body: trimmed,
        },
      });
      await tx.conversation.update({
        where: { id: input.conversation.id },
        data: {
          lastMessageAt: created.createdAt,
          lastMessageId: created.id,
          lastMessagePreview: trimmed.slice(0, PREVIEW_MAX),
        },
      });
      await tx.conversationReadState.upsert({
        where: {
          conversationId_readerUserId: {
            conversationId: input.conversation.id,
            readerUserId: input.senderUserId,
          },
        },
        create: {
          dietitianAccountId,
          organizationId: input.client.organizationId,
          conversationId: input.conversation.id,
          readerUserId: input.senderUserId,
          lastReadAt: created.createdAt,
        },
        update: { lastReadAt: created.createdAt },
      });
      return created;
    });

    await this.timeline.record({
      organizationId: dietitianAccountId,
      legacyOrganizationId: input.client.organizationId,
      clientId: input.client.id,
      type: "MESSAGE_SENT",
      actorUserId: input.senderUserId,
      targetType: "message",
      targetId: message.id,
    });

    const title = input.senderIsClient ? "New client message" : "New message from your dietitian";
    await Promise.all(
      input.notifyUserIds.map((userId) =>
        this.notifications.create({
          organizationId: dietitianAccountId,
          legacyOrganizationId: input.client.organizationId,
          userId,
          clientId: input.client.id,
          type: "NEW_MESSAGE",
          title,
          body: trimmed.slice(0, PREVIEW_MAX),
          targetType: "conversation",
          targetId: input.conversation.id,
        }),
      ),
    );

    return this.toMessageResponse(message);
  }

  async listMessages(conversationId: string, organizationId: string, before?: string, limit = 50) {
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        dietitianAccountId: organizationId,
        deletedAt: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
    return rows.reverse().map((row) => this.toMessageResponse(row));
  }

  async markRead(conversationId: string, organizationId: string, readerUserId: string) {
    const now = new Date();
    await this.prisma.conversationReadState.upsert({
      where: {
        conversationId_readerUserId: { conversationId, readerUserId },
      },
      create: {
        organizationId,
        conversationId,
        readerUserId,
        lastReadAt: now,
      },
      update: { lastReadAt: now },
    });
    return { readAt: now.toISOString() };
  }

  async unreadCount(conversationId: string, readerUserId: string, excludeSenderUserId?: string): Promise<number> {
    const state = await this.prisma.conversationReadState.findUnique({
      where: { conversationId_readerUserId: { conversationId, readerUserId } },
    });
    const since = state?.lastReadAt ?? new Date(0);
    return this.prisma.message.count({
      where: {
        conversationId,
        createdAt: { gt: since },
        deletedAt: null,
        ...(excludeSenderUserId ? { senderUserId: { not: excludeSenderUserId } } : {}),
      },
    });
  }

  async unreadCountsForReader(readerUserId: string, conversationIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    await Promise.all(
      conversationIds.map(async (conversationId) => {
        map.set(conversationId, await this.unreadCount(conversationId, readerUserId));
      }),
    );
    return map;
  }

  private toMessageResponse(row: {
    id: string;
    conversationId: string;
    senderUserId: string;
    body: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderUserId: row.senderUserId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
