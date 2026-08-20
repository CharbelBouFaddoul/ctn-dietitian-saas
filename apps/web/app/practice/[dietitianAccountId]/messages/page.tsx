"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
  Avatar,
  Badge,
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

interface InboxRow {
  id: string;
  clientId: string;
  clientName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  senderRole?: string | null;
}

function relativeTime(value: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString();
}

export default function OrgMessagesPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const searchParams = useSearchParams();
  const dietitianAccountId = params.dietitianAccountId;
  const preferredClientId = searchParams.get("clientId");
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(preferredClientId);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void api<InboxRow[]>(`/api/v1/dietitian/${dietitianAccountId}/conversations`)
      .then((data) => {
        setRows(data);
        setSelectedClientId((current) => {
          if (preferredClientId && data.some((row) => row.clientId === preferredClientId)) {
            return preferredClientId;
          }
          if (current && data.some((row) => row.clientId === current)) return current;
          return data[0]?.clientId ?? null;
        });
      })
      .catch((err) => setError(errorMessage(err, "Unable to load inbox")));
  }, [dietitianAccountId, preferredClientId]);

  useEffect(() => {
    if (!selectedClientId) {
      setMessages(null);
      return;
    }
    setMessages(null);
    setThreadError(null);
    const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${selectedClientId}`;
    void api<ChatMessage[]>(`${base}/conversation/messages`)
      .then(async (data) => {
        setMessages(data);
        await api(`${base}/conversation/read`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
        const inbox = await api<InboxRow[]>(`/api/v1/dietitian/${dietitianAccountId}/conversations`).catch(() => null);
        if (inbox) setRows(inbox);
      })
      .catch((err) => setThreadError(errorMessage(err, "Unable to load conversation")));
  }, [dietitianAccountId, selectedClientId]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!selectedClientId || !messageBody.trim()) return;
    setSending(true);
    setThreadError(null);
    try {
      const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${selectedClientId}`;
      await api(`${base}/conversation/messages`, { method: "POST", body: JSON.stringify({ body: messageBody }) });
      setMessageBody("");
      setMessages(await api<ChatMessage[]>(`${base}/conversation/messages`));
      setRows(await api<InboxRow[]>(`/api/v1/dietitian/${dietitianAccountId}/conversations`));
    } catch (err) {
      setThreadError(errorMessage(err, "Unable to send message"));
    } finally {
      setSending(false);
    }
  }

  const selected = (rows ?? []).find((row) => row.clientId === selectedClientId) ?? null;

  return (
    <section>
      <PageHeader
        title="Messages"
        description="Practice inbox for client conversations."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows === null && !error ? (
        <LoadingState />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState title="No conversations yet">
          Messages appear here once a client sends a message or you start a conversation from their profile.
        </EmptyState>
      ) : (
        <div className="ui-practice-messages">
          <aside className="ui-practice-messages__list" aria-label="Conversations">
            {(rows ?? []).map((row) => {
              const name = row.clientName || "Client";
              const active = row.clientId === selectedClientId;
              const hasUnread = row.unreadCount > 0;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`ui-practice-messages__item${active ? " is-active" : ""}`}
                  onClick={() => setSelectedClientId(row.clientId)}
                >
                  <Avatar name={name} />
                  <span className="ui-practice-messages__meta">
                    <span className="ui-practice-messages__name">
                      {name}
                      {hasUnread ? <Badge tone="accent">{row.unreadCount}</Badge> : null}
                    </span>
                    <span className="ui-muted ui-practice-messages__preview">
                      {row.lastMessagePreview || "No messages yet"}
                    </span>
                  </span>
                  <span className="ui-muted ui-practice-messages__time">{relativeTime(row.lastMessageAt)}</span>
                </button>
              );
            })}
          </aside>

          <div className="ui-practice-messages__thread">
            {selected ? (
              <>
                <div className="ui-practice-messages__thread-head">
                  <div>
                    <h2>{selected.clientName || "Client"}</h2>
                    <Link
                      href={`/practice/${dietitianAccountId}/clients/${selected.clientId}?tab=messages`}
                      className="ui-link"
                    >
                      Open client workspace
                    </Link>
                  </div>
                </div>
                {threadError ? <Alert tone="danger">{threadError}</Alert> : null}
                {messages === null ? (
                  <LoadingState>Loading conversation…</LoadingState>
                ) : messages.length === 0 ? (
                  <EmptyState title="No messages yet">Send the first message below.</EmptyState>
                ) : (
                  <div className="ui-practice-messages__bubbles">
                    {messages.map((message) => (
                      <div key={message.id} className="ui-practice-messages__bubble">
                        <p>{message.body}</p>
                        <time className="ui-muted">{formatDate(message.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                )}
                <form className="ui-practice-messages__composer" onSubmit={(event) => void onSend(event)}>
                  <Field label="Message">
                    <Textarea
                      value={messageBody}
                      onChange={(event) => setMessageBody(event.target.value)}
                      placeholder="Write a message…"
                      rows={3}
                    />
                  </Field>
                  <Button type="submit" disabled={sending || !messageBody.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </form>
              </>
            ) : (
              <EmptyState title="Select a conversation">Choose a client on the left to view messages.</EmptyState>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
