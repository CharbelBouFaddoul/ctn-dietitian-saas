"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Avatar, LoadingState, PageHeader } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { dayKey, formatChatDayLabel, formatMessageTime } from "../../../../lib/chat-format";
import { errorMessage } from "../../../../lib/humanize-error";
import { useMessagingRealtime, type RealtimeMessage } from "../../../../lib/realtime";

interface Conversation {
  id: string;
  clientId: string;
  unreadCount: number;
  lastMessagePreview: string | null;
}

interface Message {
  id: string;
  conversationId?: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

interface Me {
  user: { id: string };
  client: { id: string };
}

function mergeMessage(prev: Message[], next: Message): Message[] {
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

export default function ClientMessagesPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bubblesRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const clientIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [authMe, profile, conv, rows] = await Promise.all([
      api<{ user: { id: string } }>("/api/v1/auth/me"),
      api<{ client: { id: string } }>("/api/v1/portal/me"),
      api<Conversation>("/api/v1/portal/conversation"),
      api<Message[]>("/api/v1/portal/conversation/messages"),
    ]);
    setMe({ user: authMe.user, client: profile.client });
    setConversation(conv);
    setMessages(rows);
    clientIdRef.current = profile.client.id;
    await api("/api/v1/portal/conversation/read", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    return profile.client.id;
  }, []);

  const onRealtimeMessage = useCallback(
    (event: RealtimeMessage) => {
      if (clientIdRef.current && event.clientId !== clientIdRef.current) return;
      setMessages((prev) =>
        mergeMessage(prev, {
          id: event.messageId,
          conversationId: event.conversationId,
          senderUserId: event.senderUserId,
          body: event.body,
          createdAt: event.createdAt,
        }),
      );
      setConversation((prev) =>
        prev
          ? {
              ...prev,
              lastMessagePreview: event.body.slice(0, 120),
              unreadCount: event.senderUserId === me?.user.id ? prev.unreadCount : prev.unreadCount,
            }
          : prev,
      );
    },
    [me?.user.id],
  );

  const { connected, subscribe, unsubscribe } = useMessagingRealtime(true, {
    onMessageCreated: onRealtimeMessage,
    onUnreadUpdated: (event) => {
      if (clientIdRef.current && event.clientId !== clientIdRef.current) return;
      setConversation((prev) => (prev ? { ...prev, unreadCount: event.unreadCount } : prev));
    },
    onReconnect: () => {
      void (async () => {
        try {
          const clientId = await load();
          await subscribe(clientId);
        } catch {
          /* keep last */
        }
      })();
    },
  });

  useEffect(() => {
    void load()
      .then(async (clientId) => {
        await subscribe(clientId);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load messages")))
      .finally(() => setLoading(false));
  }, [load, subscribe]);

  useEffect(() => {
    function onSwitch() {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await unsubscribe();
          const clientId = await load();
          await subscribe(clientId);
        } catch (err) {
          setError(errorMessage(err, "Unable to load messages"));
        } finally {
          setLoading(false);
        }
      })();
    }
    window.addEventListener("portal-connection-changed", onSwitch);
    return () => window.removeEventListener("portal-connection-changed", onSwitch);
  }, [load, subscribe, unsubscribe]);

  useEffect(() => {
    const el = bubblesRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const created = await api<Message>("/api/v1/portal/conversation/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      setMessages((prev) => mergeMessage(prev, created));
      stickToBottom.current = true;
    } catch (err) {
      setError(errorMessage(err, "Unable to send message"));
    } finally {
      setSending(false);
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  let lastDay: string | null = null;

  return (
    <section className="ui-chat-page">
      <PageHeader
        title="Messages"
        description={connected ? "Chat with your dietitian — live" : "Reconnecting…"}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? <LoadingState>Loading conversation…</LoadingState> : null}

      {!loading ? (
        <div className="ui-wa-shell ui-wa-shell--portal">
          <div className="ui-wa-thread">
            <header className="ui-wa-thread__head">
              <Avatar name="Dietitian" />
              <div className="ui-wa-thread__identity">
                <h2>Your dietitian</h2>
                <span className={`ui-wa-live${connected ? " is-on" : ""}`}>
                  {connected ? "Live" : "Offline"}
                  {conversation && conversation.unreadCount > 0
                    ? ` · ${conversation.unreadCount} unread`
                    : ""}
                </span>
              </div>
            </header>
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
                  <span>Send a note when you have a question.</span>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = me?.user.id === message.senderUserId;
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
            <form className="ui-wa-composer" onSubmit={(event) => void send(event)}>
              <textarea
                className="ui-wa-composer__input"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={1}
                placeholder="Type a message"
                aria-label="Message"
              />
              <button
                type="submit"
                className="ui-wa-composer__send"
                disabled={sending || !body.trim()}
                aria-label={sending ? "Sending" : "Send message"}
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
