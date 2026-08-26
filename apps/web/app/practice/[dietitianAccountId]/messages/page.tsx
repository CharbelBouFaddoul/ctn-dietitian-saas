"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, Avatar, EmptyState, LoadingState, SearchInput } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { dayKey, formatChatDayLabel, formatMessageTime } from "../../../../lib/chat-format";
import { errorMessage } from "../../../../lib/humanize-error";
import {
  useMessagingRealtime,
  type RealtimeMessage,
  type RealtimeMessageDeleted,
} from "../../../../lib/realtime";

interface InboxRow {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
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
  deleted?: boolean;
  canDeleteForEveryone?: boolean;
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
  return [...prev, next].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function matchesInboxSearch(row: InboxRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const phoneDigits = (row.clientPhone ?? "").replace(/\D/g, "");
  const queryDigits = q.replace(/\D/g, "");
  return (
    row.clientName.toLowerCase().includes(q) ||
    (row.clientEmail ?? "").toLowerCase().includes(q) ||
    (row.clientPhone ?? "").toLowerCase().includes(q) ||
    (queryDigits.length > 0 && phoneDigits.includes(queryDigits))
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.6 21 12 3.4 3.4l-.05 6.75L15 12 3.35 13.85z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
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
  const [inboxQuery, setInboxQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(preferredClientId);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      // Clear unread immediately so the active row / nav badge don't linger.
      setRows((prev) =>
        prev
          ? prev.map((row) => (row.clientId === clientId ? { ...row, unreadCount: 0 } : row))
          : prev,
      );
      await api(`${base}/conversation/read`, { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
      const data = await api<ChatMessage[]>(`${base}/conversation/messages`);
      setMessages(data);
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
          deleted: false,
          canDeleteForEveryone: true,
        }),
      );
      // Viewing this thread — keep it read.
      setRows((prev) =>
        prev
          ? prev.map((row) =>
              row.clientId === event.clientId ? { ...row, unreadCount: 0 } : row,
            )
          : prev,
      );
      const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${event.clientId}`;
      void api(`${base}/conversation/read`, { method: "POST", body: JSON.stringify({}) })
        .then(() => refreshInbox())
        .catch(() => undefined);
    },
    [selectedClientId, dietitianAccountId, refreshInbox],
  );

  const onRealtimeDeleted = useCallback(
    (event: RealtimeMessageDeleted) => {
      if (event.clientId !== selectedClientId) {
        void refreshInbox().catch(() => undefined);
        return;
      }
      if (event.scope === "me") {
        setMessages((prev) => (prev ?? []).filter((row) => row.id !== event.messageId));
      } else {
        setMessages((prev) =>
          (prev ?? []).map((row) =>
            row.id === event.messageId
              ? { ...row, body: "", deleted: true, canDeleteForEveryone: false }
              : row,
          ),
        );
      }
      void refreshInbox().catch(() => undefined);
    },
    [selectedClientId, refreshInbox],
  );

  const { connected, subscribe } = useMessagingRealtime(true, {
    onMessageCreated: onRealtimeMessage,
    onMessageDeleted: onRealtimeDeleted,
    onMessageRead: (event) => {
      if (event.clientId !== selectedClientId) return;
      if (!me?.user.id || event.readerUserId === me.user.id) return;
      const readAt = new Date(event.lastReadAt).getTime();
      const myId = me.user.id;
      window.setTimeout(() => {
        setMessages((prev) =>
          (prev ?? []).map((row) => {
            if (row.senderUserId !== myId || row.deleted || !row.canDeleteForEveryone) return row;
            if (new Date(row.createdAt).getTime() > readAt) return row;
            return { ...row, canDeleteForEveryone: false };
          }),
        );
      }, 60_000);
    },
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
    setMenuMessageId(null);
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

  useEffect(() => {
    if (!menuMessageId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".ui-wa-msg-menu")) return;
      setMenuMessageId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuMessageId]);

  const filteredRows = useMemo(
    () => (rows ?? []).filter((row) => matchesInboxSearch(row, inboxQuery)),
    [rows, inboxQuery],
  );

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

  async function onDelete(messageId: string, scope: "me" | "everyone") {
    if (!selectedClientId || deleting) return;
    setDeleting(true);
    setThreadError(null);
    setMenuMessageId(null);
    try {
      const base = `/api/v1/dietitian/${dietitianAccountId}/clients/${selectedClientId}`;
      await api(`${base}/conversation/messages/${messageId}/delete`, {
        method: "POST",
        body: JSON.stringify({ scope }),
      });
      if (scope === "me") {
        setMessages((prev) => (prev ?? []).filter((row) => row.id !== messageId));
      } else {
        setMessages((prev) =>
          (prev ?? []).map((row) =>
            row.id === messageId
              ? { ...row, body: "", deleted: true, canDeleteForEveryone: false }
              : row,
          ),
        );
      }
      await refreshInbox();
    } catch (err) {
      setThreadError(errorMessage(err, "Unable to delete message"));
    } finally {
      setDeleting(false);
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
    <section className="ui-chat-page ui-chat-page--flush">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {rows === null && !error ? (
        <LoadingState />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState title="No conversations yet">
          Messages appear here once a client sends a message or you start a conversation from their profile.
        </EmptyState>
      ) : (
        <div className="ui-wa-shell ui-wa-shell--fill">
          <aside className="ui-wa-inbox" aria-label="Conversations">
            <div className="ui-wa-inbox__head">
              <h2>Chats</h2>
              <span className={`ui-wa-live${connected ? " is-on" : ""}`} title={connected ? "Live" : "Offline"}>
                {connected ? "Live" : "Offline"}
              </span>
            </div>
            <div className="ui-wa-inbox__search">
              <SearchInput
                value={inboxQuery}
                onChange={setInboxQuery}
                placeholder="Search name, email, or phone…"
                aria-label="Search conversations"
              />
            </div>
            <div className="ui-wa-inbox__list">
              {filteredRows.length === 0 ? (
                <p className="ui-wa-inbox__empty">No chats match your search.</p>
              ) : (
                filteredRows.map((row) => {
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
                })
              )}
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
                      href={`/practice/${dietitianAccountId}/clients/${selected.clientId}?tab=overview`}
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
                        const menuOpen = menuMessageId === message.id;
                        return (
                          <div key={message.id} className="ui-wa-msg-block">
                            {showDay ? (
                              <div className="ui-wa-day">
                                <span>{formatChatDayLabel(message.createdAt)}</span>
                              </div>
                            ) : null}
                            <div className={`ui-wa-msg-row${mine ? " is-mine" : " is-theirs"}`}>
                              <div
                                className={`ui-wa-bubble${mine ? " is-mine" : " is-theirs"}${
                                  message.deleted ? " is-deleted" : ""
                                }`}
                              >
                                {message.deleted ? (
                                  <p className="ui-wa-bubble__deleted">This message was deleted</p>
                                ) : (
                                  <p>{message.body}</p>
                                )}
                                <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                              </div>
                              {!message.deleted ? (
                                <div className={`ui-wa-msg-menu${menuOpen ? " is-open" : ""}`}>
                                  <button
                                    type="button"
                                    className="ui-wa-msg-menu__trigger"
                                    aria-label="Message actions"
                                    aria-expanded={menuOpen}
                                    onClick={() =>
                                      setMenuMessageId((current) => (current === message.id ? null : message.id))
                                    }
                                  >
                                    <MoreIcon />
                                  </button>
                                  {menuOpen ? (
                                    <div className="ui-wa-msg-menu__panel" role="menu">
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled={deleting}
                                        onClick={() => void onDelete(message.id, "me")}
                                      >
                                        Delete for me
                                      </button>
                                      {mine && message.canDeleteForEveryone ? (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          disabled={deleting}
                                          onClick={() => void onDelete(message.id, "everyone")}
                                        >
                                          Delete for everyone
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
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
