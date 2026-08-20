"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

interface Conversation {
  id: string;
  unreadCount: number;
  lastMessagePreview: string | null;
}

interface Message {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

interface Me {
  user: { id: string };
}

export default function ClientMessagesPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const profile = await api<Me>("/api/v1/portal/me");
    const conv = await api<Conversation>("/api/v1/portal/conversation");
    const rows = await api<Message[]>("/api/v1/portal/conversation/messages");
    setMe(profile);
    setConversation(conv);
    setMessages(rows);
    await api("/api/v1/portal/conversation/read", { method: "POST", body: JSON.stringify({}) });
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load messages"));
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    await api("/api/v1/portal/conversation/messages", { method: "POST", body: JSON.stringify({ body }) });
    setBody("");
    await load();
  }

  return (
    <div>
      <h1>Messages</h1>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      {conversation && conversation.unreadCount > 0 ? (
        <p style={{ color: "var(--color-muted)" }}>{conversation.unreadCount} unread</p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {messages.map((message) => {
          const mine = me?.user.id === message.senderUserId;
          return (
            <div
              key={message.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                background: mine ? "var(--color-accent-soft, #eef6ff)" : "var(--color-surface, #f5f5f5)",
                padding: "10px 12px",
                borderRadius: 12,
                maxWidth: "85%",
              }}
            >
              <div>{message.body}</div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
                {new Date(message.createdAt).toLocaleString()}
              </div>
            </div>
          );
        })}
        {messages.length === 0 ? <p style={{ color: "var(--color-muted)" }}>No messages yet.</p> : null}
      </div>
      <form onSubmit={(event) => void send(event).catch((err) => setError(err instanceof Error ? err.message : "Send failed"))}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="Write a message..."
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button type="submit">Send</button>
      </form>
      <p style={{ marginTop: 16 }}>
        <Link href="/client">Back home</Link>
      </p>
    </div>
  );
}
