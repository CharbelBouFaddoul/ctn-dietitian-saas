"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, Avatar, EmptyState, LoadingState, PageHeader } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { dayKey, formatChatDayLabel, formatMessageTime } from "../../../../lib/chat-format";
import { errorMessage } from "../../../../lib/humanize-error";
import { useMessagingRealtime, type RealtimeMessage } from "../../../../lib/realtime";

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
  conversationId?: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

interface Me {
  user: { id: string };
}

function relativeTime(value: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mergeMessage(prev: ChatMessage[], next: ChatMessage): ChatMessage[] {
  if (prev.some((row) => row.id === next.id)) return prev;
  return [...prev, next];
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.6 21 12 3.4 3.4l-.05 6.75L15 12 3.35 13.85z" />
    </svg>
  );
}

export default function PracticeMessagesPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const searchParams = useSearchParams();
  const dietitianAccountId = params.dietitianAccountId;
  const preferredClientId = searchParams.get("clientId");
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(preferredClientId);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bubblesRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const refreshInbox = useCallback(async () => {
    const data = await api<InboxRow[]>(`/api/v1/dietitian/${dietitianAccountId}/conversations`);
    setRows(data);
    return data;
  }, [dietitianAccountId]);

  const loadThread = useCallback(
    async (clientId: string) => {
      const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}`;
      const data = await api<ChatMessage[]>(`${base}/conversation/messages`);
      setMessages(data);
      await api(`${base}/conversation/read`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
      await refreshInbox().catch(() => undefined);
    },
    [dietitianAccountId, refreshInbox],
  );

  const onRealtimeMessage = useCallback(
    (event: RealtimeMessage) => {
      if (event.clientId !== selectedClientId) {
        void refreshInbox().catch(() => undefined);
        return;
      }
      setMessages((prev) =>
        mergeMessage(prev ?? [], {
          id: event.messageId,
          conversationId: event.conversationId,
          senderUserId: event.senderUserId,
          body: event.body,
          createdAt: event.createdAt,
        }),
      );
      void refreshInbox().catch(() => undefined);
    },
    [selectedClientId, refreshInbox],
  );

  const { connected, subscribe } = useMessagingRealtime(true, {
    onMessageCreated: onRealtimeMessage,
    onConversationUpdated: () => {
      void refreshInbox().catch(() => undefined);
    },
    onUnreadUpdated: () => {
      void refreshInbox().catch(() => undefined);
    },
    onReconnect: () => {
      void (async () => {
        try {
          await refreshInbox();
          if (selectedClientId) {
            await loadThread(selectedClientId);
            await subscribe(selectedClientId);
          }
        } catch {
          /* keep last good state */
        }
      })();
    },
  });

  useEffect(() => {
    void api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    void refreshInbox()
      .then((data) => {
        setSelectedClientId((current) => {
          if (preferredClientId && data.some((row) => row.clientId === preferredClientId)) {
            return preferredClientId;
          }
          if (current && data.some((row) => row.clientId === current)) return current;
          return data[0]?.clientId ?? null;
        });
      })
      .catch((err) => setError(errorMessage(err, "Unable to load inbox")));
  }, [dietitianAccountId, preferredClientId, refreshInbox]);

  useEffect(() => {
    if (!selectedClientId) {
      setMessages(null);
      return;
    }
    setMessages(null);
    setThreadError(null);
    void loadThread(selectedClientId).catch((err) =>
      setThreadError(errorMessage(err, "Unable to load conversation")),
    );
    void subscribe(selectedClientId);
  }, [selectedClientId, loadThread, subscribe]);

  useEffect(() => {
    const el = bubblesRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function onSend(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedClientId || !messageBody.trim()) return;
    setSending(true);
    setThreadError(null);
    try {
      const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${selectedClientId}`;
      const created = await api<ChatMessage>(`${base}/conversation/messages`, {
        method: "POST",
        body: JSON.stringify({ body: messageBody }),
      });
      setMessageBody("");
      setMessages((prev) => mergeMessage(prev ?? [], created));
      stickToBottom.current = true;
      await refreshInbox();
    } catch (err) {
      setThreadError(errorMessage(err, "Unable to send message"));
    } finally {
      setSending(false);
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSend();
    }
  }

  const selected = (rows ?? []).find((row) => row.clientId === selectedClientId) ?? null;
  const myId = me?.user.id;
  let lastDay: string | null = null;

  return (
    <section className="ui-chat-page">
      <PageHeader
        title="Messages"
        description={connected ? "Live updates on" : "Reconnecting…"}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows === null && !error ? (
        <LoadingState />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState title="No conversations yet">
          Messages appear here once a client sends a message or you start a conversation from their profile.
        </EmptyState>
      ) : (
        <div className="ui-wa-shell">
          <aside className="ui-wa-inbox" aria-label="Conversations">
            <div className="ui-wa-inbox__head">
              <h2>Chats</h2>
              <span className={`ui-wa-live${connected ? " is-on" : ""}`} title={connected ? "Live" : "Offline"}>
                {connected ? "Live" : "Offline"}
              </span>
            </div>
            <div className="ui-wa-inbox__list">
              {(rows ?? []).map((row) => {
                const name = row.clientName || "Client";
                const active = row.clientId === selectedClientId;
                const hasUnread = row.unreadCount > 0;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`ui-wa-inbox__item${active ? " is-active" : ""}${hasUnread ? " is-unread" : ""}`}
                    onClick={() => setSelectedClientId(row.clientId)}
                  >
                    <Avatar name={name} />
                    <span className="ui-wa-inbox__meta">
                      <span className="ui-wa-inbox__top">
                        <span className="ui-wa-inbox__name">{name}</span>
                        <span className="ui-wa-inbox__time">{relativeTime(row.lastMessageAt)}</span>
                      </span>
                      <span className="ui-wa-inbox__bottom">
                        <span className="ui-wa-inbox__preview">{row.lastMessagePreview || "No messages yet"}</span>
                        {hasUnread ? <span className="ui-wa-unread">{row.unreadCount}</span> : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="ui-wa-thread">
            {selected ? (
              <>
                <header className="ui-wa-thread__head">
                  <Avatar name={selected.clientName || "Client"} />
                  <div className="ui-wa-thread__identity">
                    <h2>{selected.clientName || "Client"}</h2>
                    <Link
                      href={`/practice/${dietitianAccountId}/clients/${selected.clientId}?tab=messages`}
                      className="ui-wa-thread__link"
                    >
                      Open client profile
                    </Link>
                  </div>
                </header>
                {threadError ? (
                  <div className="ui-wa-thread__alert">
                    <Alert tone="danger">{threadError}</Alert>
                  </div>
                ) : null}
                {messages === null ? (
                  <div className="ui-wa-thread__empty">
                    <LoadingState>Loading conversation…</LoadingState>
                  </div>
                ) : (
                  <div
                    ref={bubblesRef}
                    className="ui-wa-thread__messages"
                    onScroll={(event) => {
                      const el = event.currentTarget;
                      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
                    }}
                  >
                    {messages.length === 0 ? (
                      <div className="ui-wa-empty">
                        <p>No messages yet</p>
                        <span>Send the first message to start the conversation.</span>
                      </div>
                    ) : (
                      messages.map((message) => {
                        const mine = myId != null && message.senderUserId === myId;
                        const key = dayKey(message.createdAt);
                        const showDay = key !== lastDay;
                        lastDay = key;
                        return (
                          <div key={message.id} className="ui-wa-msg-block">
                            {showDay ? (
                              <div className="ui-wa-day">
                                <span>{formatChatDayLabel(message.createdAt)}</span>
                              </div>
                            ) : null}
                            <div className={`ui-wa-bubble${mine ? " is-mine" : " is-theirs"}`}>
                              <p>{message.body}</p>
                              <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
                <form className="ui-wa-composer" onSubmit={(event) => void onSend(event)}>
                  <textarea
                    className="ui-wa-composer__input"
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder="Type a message"
                    rows={1}
                    aria-label="Message"
                  />
                  <button
                    type="submit"
                    className="ui-wa-composer__send"
                    disabled={sending || !messageBody.trim()}
                    aria-label={sending ? "Sending" : "Send message"}
                  >
                    <SendIcon />
                  </button>
                </form>
              </>
            ) : (
              <div className="ui-wa-thread__empty">
                <EmptyState title="Select a conversation">Choose a client on the left to view messages.</EmptyState>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
