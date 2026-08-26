import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, Conversation, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { NotificationService } from "../notifications/notification.service";
import { MessagingRealtimeService } from "./messaging-realtime.service";
import { MessagingRecipientService } from "./messaging-recipient.service";

const PREVIEW_MAX = 120;
/** Absolute max age to delete for everyone (from send time). */
const DELETE_EVERYONE_MAX_AGE_MS = 30 * 60 * 1000;
/** After a peer has seen the message, delete-for-everyone window from that seen time. */
const DELETE_EVERYONE_AFTER_SEEN_MS = 60 * 1000;

function previewText(value: string, max = PREVIEW_MAX): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return chars.slice(0, max).join("");
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly notifications: NotificationService,
    private readonly realtime: MessagingRealtimeService,
    private readonly recipients: MessagingRecipientService,
  ) {}

  async getOrCreate(client: Client): Promise<Conversation> {
    const dietitianAccountId = requireDietitianAccountId(client);
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
        clientId: client.id,
      },
    });
  }

  async getForClient(client: Client, conversationId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
      },
    });
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }
    return conversation;
  }

  async listInbox(dietitianAccountId: string, clientIds: string[], viewerUserId: string) {
    if (clientIds.length === 0) return [];
    const rows = await this.prisma.conversation.findMany({
      where: { dietitianAccountId, clientId: { in: clientIds }, status: "ACTIVE" },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    const previews = await this.latestVisiblePreviews(
      rows.map((row) => row.id),
      viewerUserId,
    );
    const mapped = rows.map((row) => {
      const visible = previews.get(row.id);
      return {
        id: row.id,
        clientId: row.clientId,
        clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
        clientEmail: row.client.email,
        clientPhone: row.client.phone,
        status: row.status,
        lastMessageAt: visible?.createdAt.toISOString() ?? null,
        lastMessagePreview: visible?.preview ?? null,
      };
    });
    mapped.sort((a, b) => {
      const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return tb - ta;
    });
    return mapped;
  }

  /** Conversation summary with a preview visible to this viewer (excludes soft-deletes + their hides). */
  async summarizeForViewer(conversation: Conversation, viewerUserId: string) {
    const visible = await this.latestVisibleMessage(conversation.id, viewerUserId);
    return {
      id: conversation.id,
      clientId: conversation.clientId,
      status: conversation.status,
      lastMessageAt: visible?.createdAt.toISOString() ?? null,
      lastMessagePreview: visible ? previewText(visible.body) : null,
    };
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

    const dietitianAccountId = requireDietitianAccountId(input.client);
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          dietitianAccountId,
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
          lastMessagePreview: previewText(trimmed),
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
          conversationId: input.conversation.id,
          readerUserId: input.senderUserId,
          lastReadAt: created.createdAt,
        },
        update: { lastReadAt: created.createdAt },
      });
      return created;
    });

    await this.timeline.record({
      dietitianAccountId: dietitianAccountId,
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
          dietitianAccountId,
          userId,
          clientId: input.client.id,
          type: "NEW_MESSAGE",
          title,
          body: previewText(trimmed),
          targetType: "conversation",
          targetId: input.conversation.id,
        }),
      ),
    );

    const response = this.toMessageResponse(message, input.senderUserId);
    this.realtime.emitMessageCreated({
      messageId: response.id,
      conversationId: response.conversationId,
      clientId: input.client.id,
      senderUserId: response.senderUserId,
      body: response.body,
      createdAt: response.createdAt,
    });

    // Notify recipients of unread bumps (sender already marked read).
    await Promise.all(
      input.notifyUserIds.map(async (userId) => {
        const unreadCount = await this.unreadCount(input.conversation.id, userId);
        this.realtime.emitUnreadCountUpdated({
          scope: "conversation",
          conversationId: input.conversation.id,
          clientId: input.client.id,
          userId,
          unreadCount,
        });
      }),
    );

    return response;
  }

  async listMessages(
    conversationId: string,
    dietitianAccountId: string,
    viewerUserId: string,
    before?: string,
    limit = 50,
  ) {
    const [rows, readStates] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          conversationId,
          dietitianAccountId,
          hides: { none: { userId: viewerUserId } },
          ...(before ? { createdAt: { lt: new Date(before) } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 100),
      }),
      this.prisma.conversationReadState.findMany({
        where: { conversationId },
        select: { readerUserId: true, lastReadAt: true },
      }),
    ]);
    const now = Date.now();
    return rows
      .reverse()
      .map((row) => this.toMessageResponse(row, viewerUserId, readStates, now));
  }

  async deleteMessage(input: {
    conversation: Conversation;
    client: Client;
    messageId: string;
    actorUserId: string;
    scope: "me" | "everyone";
  }) {
    const dietitianAccountId = requireDietitianAccountId(input.client);
    const message = await this.prisma.message.findFirst({
      where: {
        id: input.messageId,
        conversationId: input.conversation.id,
        dietitianAccountId,
        clientId: input.client.id,
      },
    });
    if (!message) {
      throw new NotFoundException("Message not found");
    }

    if (input.scope === "me") {
      await this.prisma.messageHide.upsert({
        where: {
          messageId_userId: { messageId: message.id, userId: input.actorUserId },
        },
        create: { messageId: message.id, userId: input.actorUserId },
        update: {},
      });
      const visible = await this.latestVisibleMessage(input.conversation.id, input.actorUserId);
      this.realtime.emitMessageDeleted({
        messageId: message.id,
        conversationId: input.conversation.id,
        clientId: input.client.id,
        scope: "me",
        userId: input.actorUserId,
      });
      this.realtime.emitConversationUpdated({
        conversationId: input.conversation.id,
        clientId: input.client.id,
        lastMessageAt: visible?.createdAt.toISOString() ?? null,
        lastMessagePreview: visible ? previewText(visible.body) : null,
        userId: input.actorUserId,
      });
      return { ok: true, scope: "me" as const, messageId: message.id };
    }

    if (message.senderUserId !== input.actorUserId) {
      throw new ForbiddenException("Only the sender can delete a message for everyone");
    }
    if (message.deletedAt) {
      return {
        ok: true,
        scope: "everyone" as const,
        messageId: message.id,
        message: this.toMessageResponse(message, input.actorUserId),
      };
    }

    const readStates = await this.prisma.conversationReadState.findMany({
      where: { conversationId: input.conversation.id },
      select: { readerUserId: true, lastReadAt: true },
    });
    const eligibility = this.deleteForEveryoneEligibility(message, readStates, Date.now());
    if (!eligibility.allowed) {
      throw new BadRequestException(eligibility.reason);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // Soft-delete only: keep body in DB for audit/recovery; API never returns it once deleted.
      const row = await tx.message.update({
        where: { id: message.id },
        data: { deletedAt: now },
      });
      await this.syncSharedLastMessage(tx, input.conversation.id);
      return row;
    });

    const shared = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: input.conversation.id },
      select: { lastMessageAt: true, lastMessagePreview: true },
    });

    this.realtime.emitMessageDeleted({
      messageId: updated.id,
      conversationId: input.conversation.id,
      clientId: input.client.id,
      scope: "everyone",
    });
    this.realtime.emitConversationUpdated({
      conversationId: input.conversation.id,
      clientId: input.client.id,
      lastMessageAt: shared.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: shared.lastMessagePreview,
    });

    return {
      ok: true,
      scope: "everyone" as const,
      messageId: updated.id,
      message: this.toMessageResponse(updated, input.actorUserId, readStates),
    };
  }

  async markRead(
    conversationId: string,
    client: { id: string; dietitianAccountId: string },
    readerUserId: string,
  ) {
    const dietitianAccountId = requireDietitianAccountId(client);
    const latest = await this.prisma.message.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const now = new Date();
    // Cover clock skew / seeded future-dated rows so opening a thread clears unread.
    const lastReadAt =
      latest?.createdAt && latest.createdAt.getTime() > now.getTime() ? latest.createdAt : now;

    await this.prisma.conversationReadState.upsert({
      where: {
        conversationId_readerUserId: { conversationId, readerUserId },
      },
      create: {
        dietitianAccountId,
        conversationId,
        readerUserId,
        lastReadAt,
      },
      update: { lastReadAt },
    });

    const readAt = lastReadAt.toISOString();
    this.realtime.emitMessageRead({
      conversationId,
      clientId: client.id,
      readerUserId,
      lastReadAt: readAt,
    });
    this.realtime.emitUnreadCountUpdated({
      scope: "conversation",
      conversationId,
      clientId: client.id,
      userId: readerUserId,
      unreadCount: 0,
    });

    // Peer (other participant) may want conversation list refresh.
    const peerIds = new Set<string>();
    const portalUserId = await this.recipients.clientPortalUserId(client.id);
    if (portalUserId) peerIds.add(portalUserId);
    const ownerIds = await this.recipients.assignedMemberUserIds(dietitianAccountId, client.id);
    for (const id of ownerIds) peerIds.add(id);
    peerIds.delete(readerUserId);
    for (const userId of peerIds) {
      const unreadCount = await this.unreadCount(conversationId, userId);
      this.realtime.emitUnreadCountUpdated({
        scope: "conversation",
        conversationId,
        clientId: client.id,
        userId,
        unreadCount,
      });
    }

    return { readAt };
  }

  async unreadCount(conversationId: string, readerUserId: string): Promise<number> {
    const state = await this.prisma.conversationReadState.findUnique({
      where: { conversationId_readerUserId: { conversationId, readerUserId } },
    });
    const since = state?.lastReadAt ?? new Date(0);
    return this.prisma.message.count({
      where: {
        conversationId,
        createdAt: { gt: since },
        deletedAt: null,
        senderUserId: { not: readerUserId },
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

  private async latestVisibleMessage(conversationId: string, viewerUserId: string) {
    return this.prisma.message.findFirst({
      where: {
        conversationId,
        deletedAt: null,
        hides: { none: { userId: viewerUserId } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, createdAt: true },
    });
  }

  private async latestVisiblePreviews(conversationIds: string[], viewerUserId: string) {
    const map = new Map<string, { preview: string; createdAt: Date; id: string }>();
    if (conversationIds.length === 0) return map;
    await Promise.all(
      conversationIds.map(async (conversationId) => {
        const message = await this.latestVisibleMessage(conversationId, viewerUserId);
        if (!message) return;
        map.set(conversationId, {
          id: message.id,
          preview: previewText(message.body),
          createdAt: message.createdAt,
        });
      }),
    );
    return map;
  }

  /** Shared denormalized preview: latest message that is not soft-deleted for everyone. */
  private async syncSharedLastMessage(tx: Prisma.TransactionClient, conversationId: string) {
    const previous = await tx.message.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, createdAt: true },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: previous
        ? {
            lastMessageId: previous.id,
            lastMessageAt: previous.createdAt,
            lastMessagePreview: previewText(previous.body),
          }
        : {
            lastMessageId: null,
            lastMessageAt: null,
            lastMessagePreview: null,
          },
    });
  }

  private deleteForEveryoneEligibility(
    message: { senderUserId: string; createdAt: Date; deletedAt?: Date | null },
    readStates: Array<{ readerUserId: string; lastReadAt: Date }>,
    nowMs: number,
  ): { allowed: true } | { allowed: false; reason: string } {
    if (message.deletedAt) {
      return { allowed: false, reason: "This message was already deleted" };
    }

    const ageMs = nowMs - message.createdAt.getTime();
    if (ageMs > DELETE_EVERYONE_MAX_AGE_MS) {
      return {
        allowed: false,
        reason: "Messages older than 30 minutes cannot be deleted for everyone",
      };
    }

    const peerSeenAts = readStates
      .filter(
        (state) =>
          state.readerUserId !== message.senderUserId &&
          state.lastReadAt.getTime() >= message.createdAt.getTime(),
      )
      .map((state) => state.lastReadAt.getTime());

    if (peerSeenAts.length > 0) {
      const seenAtMs = Math.min(...peerSeenAts);
      if (nowMs - seenAtMs > DELETE_EVERYONE_AFTER_SEEN_MS) {
        return {
          allowed: false,
          reason: "Seen messages can only be deleted for everyone within 1 minute",
        };
      }
    }

    return { allowed: true };
  }

  private toMessageResponse(
    row: {
      id: string;
      conversationId: string;
      senderUserId: string;
      body: string;
      createdAt: Date;
      deletedAt?: Date | null;
    },
    viewerUserId?: string,
    readStates: Array<{ readerUserId: string; lastReadAt: Date }> = [],
    nowMs = Date.now(),
  ) {
    const deleted = Boolean(row.deletedAt);
    const isSender = viewerUserId != null && row.senderUserId === viewerUserId;
    const canDeleteForEveryone =
      isSender &&
      this.deleteForEveryoneEligibility(row, readStates, nowMs).allowed;

    return {
      id: row.id,
      conversationId: row.conversationId,
      senderUserId: row.senderUserId,
      // Soft-deleted messages keep body in DB; clients only see a tombstone.
      body: deleted ? "" : row.body,
      createdAt: row.createdAt.toISOString(),
      deleted,
      canDeleteForEveryone,
    };
  }
}
