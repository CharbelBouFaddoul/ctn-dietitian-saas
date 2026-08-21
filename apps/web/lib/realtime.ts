"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

export type RealtimeMessage = {
  messageId: string;
  conversationId: string;
  clientId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
};

export type RealtimeConversationUpdated = {
  conversationId: string;
  clientId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type RealtimeUnreadUpdated = {
  scope: "conversation";
  conversationId: string;
  clientId: string;
  userId: string;
  unreadCount: number;
};

export type RealtimeMessageRead = {
  conversationId: string;
  clientId: string;
  readerUserId: string;
  lastReadAt: string;
};

export type RealtimeMessageDeleted = {
  messageId: string;
  conversationId: string;
  clientId: string;
  scope: "me" | "everyone";
  userId?: string;
};

type Handlers = {
  onMessageCreated?: (event: RealtimeMessage) => void;
  onConversationUpdated?: (event: RealtimeConversationUpdated) => void;
  onUnreadUpdated?: (event: RealtimeUnreadUpdated) => void;
  onMessageRead?: (event: RealtimeMessageRead) => void;
  onMessageDeleted?: (event: RealtimeMessageDeleted) => void;
  onReconnect?: () => void;
};

/**
 * One Socket.IO connection per browser session. REST remains the send path;
 * this transport only delivers authorized realtime events.
 */
export function useMessagingRealtime(enabled: boolean, handlers: Handlers) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io(`${API_URL}/realtime`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.io.on("reconnect", () => {
      setConnected(true);
      handlersRef.current.onReconnect?.();
    });
    socket.on("message.created", (event: RealtimeMessage) => {
      handlersRef.current.onMessageCreated?.(event);
    });
    socket.on("conversation.updated", (event: RealtimeConversationUpdated) => {
      handlersRef.current.onConversationUpdated?.(event);
    });
    socket.on("unread_count.updated", (event: RealtimeUnreadUpdated) => {
      handlersRef.current.onUnreadUpdated?.(event);
    });
    socket.on("message.read", (event: RealtimeMessageRead) => {
      handlersRef.current.onMessageRead?.(event);
    });
    socket.on("message.deleted", (event: RealtimeMessageDeleted) => {
      handlersRef.current.onMessageDeleted?.(event);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  const subscribe = useCallback(async (clientId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return { ok: false as const };
    const result = await socket.emitWithAck("conversation.subscribe", { clientId });
    return result as { ok: boolean; conversationId?: string; clientId?: string; error?: string };
  }, []);

  const unsubscribe = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    await socket.emitWithAck("conversation.unsubscribe", {});
  }, []);

  return { connected, subscribe, unsubscribe, socket: socketRef };
}
