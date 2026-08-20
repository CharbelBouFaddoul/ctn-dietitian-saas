"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { formatDate } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";

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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function load() {
    const profile = await api<Me>("/api/v1/portal/me");
    const conv = await api<Conversation>("/api/v1/portal/conversation");
    const rows = await api<Message[]>("/api/v1/portal/conversation/messages");
    setMe(profile);
    setConversation(conv);
    setMessages(rows);
    await api("/api/v1/portal/conversation/read", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
  }

  useEffect(() => {
    void load()
      .catch((err) => setError(errorMessage(err, "Unable to load messages")))
      .finally(() => setLoading(false));
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api("/api/v1/portal/conversation/messages", { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to send message"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Conversation"
        title="Messages"
        description="Chat with your dietitian about your plan and progress."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? <LoadingState>Loading conversation…</LoadingState> : null}

      {!loading ? (
        <div className="ui-client-chat">
          {conversation && conversation.unreadCount > 0 ? (
            <p className="ui-muted" style={{ margin: 0 }}>
              {conversation.unreadCount} unread
            </p>
          ) : null}
          <div className="ui-client-chat__bubbles">
            {messages.length === 0 ? (
              <EmptyState title="No messages yet">
                Send a note to your dietitian when you have a question.
              </EmptyState>
            ) : (
              messages.map((message) => {
                const mine = me?.user.id === message.senderUserId;
                return (
                  <div
                    key={message.id}
                    className={`ui-client-bubble ${mine ? "ui-client-bubble--mine" : "ui-client-bubble--theirs"}`}
                  >
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.body}</div>
                    <time>{formatDate(message.createdAt)}</time>
                  </div>
                );
              })
            )}
          </div>
          <form className="ui-client-chat__composer" onSubmit={(event) => void send(event)}>
            <Field label="Message">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                placeholder="Write a message…"
              />
            </Field>
            <Button type="submit" disabled={sending || !body.trim()}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
