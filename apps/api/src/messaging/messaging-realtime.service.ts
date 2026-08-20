import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

export const REALTIME_NAMESPACE = "/realtime";

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export type MessageCreatedEvent = {
  messageId: string;
  conversationId: string;
  clientId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
};

export type ConversationUpdatedEvent = {
  conversationId: string;
  clientId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type MessageReadEvent = {
  conversationId: string;
  clientId: string;
  readerUserId: string;
  lastReadAt: string;
};

export type UnreadCountUpdatedEvent = {
  scope: "conversation";
  conversationId: string;
  clientId: string;
  userId: string;
  unreadCount: number;
};

/**
 * Thin emit helper so ConversationService can publish without depending on the gateway class.
 */
@Injectable()
export class MessagingRealtimeService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitMessageCreated(event: MessageCreatedEvent): void {
    if (!this.server) return;
    this.server.to(conversationRoom(event.conversationId)).emit("message.created", event);
    this.server.to(conversationRoom(event.conversationId)).emit("conversation.updated", {
      conversationId: event.conversationId,
      clientId: event.clientId,
      lastMessageAt: event.createdAt,
      lastMessagePreview: event.body.slice(0, 120),
    } satisfies ConversationUpdatedEvent);
  }

  emitMessageRead(event: MessageReadEvent): void {
    if (!this.server) return;
    this.server.to(conversationRoom(event.conversationId)).emit("message.read", event);
  }

  emitUnreadCountUpdated(event: UnreadCountUpdatedEvent): void {
    if (!this.server) return;
    this.server.to(userRoom(event.userId)).emit("unread_count.updated", event);
  }
}
