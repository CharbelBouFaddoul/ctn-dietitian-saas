"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { api } from "./api";
import { formatDate } from "./format";
import { hrefForNotification } from "./notification-href";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  type: string;
  targetType?: string | null;
  targetId?: string | null;
  clientId?: string | null;
}

type Mode =
  | { kind: "practice"; dietitianAccountId: string }
  | { kind: "portal" };

const POLL_MS = 45_000;

export function notificationTypeLabel(type: string): string {
  const map: Record<string, string> = {
    NEW_MESSAGE: "Message",
    DOCUMENT_SHARED: "Document",
    DOCUMENT_UPLOADED: "Document",
    INVOICE_SENT: "Invoice",
    TASK_ASSIGNED: "Task",
    AUTOMATION: "Automation",
    APPOINTMENT_CREATED: "Appointment",
    APPOINTMENT_UPDATED: "Appointment",
    APPOINTMENT_CANCELLED: "Appointment",
    CLIENT_JOINED: "Client",
    SUBSCRIPTION_GRACE: "Subscription",
    SUBSCRIPTION_READ_ONLY: "Subscription",
    SUBSCRIPTION_LOCKED: "Subscription",
    MEAL_PLAN_PUBLISHED: "Meal plan",
  };
  return map[type] ?? "Update";
}

function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function useNotifications(mode: Mode, enabled = true) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const base =
    mode.kind === "practice"
      ? `/api/v1/dietitian/${mode.dietitianAccountId}/notifications`
      : "/api/v1/portal/notifications";
  const listHref =
    mode.kind === "practice"
      ? `/practice/${mode.dietitianAccountId}/notifications`
      : "/client/notifications";

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [list, unread] = await Promise.all([
        api<NotificationItem[]>(base),
        api<{ count: number }>(`${base}/unread-count`),
      ]);
      setItems(list.slice(0, 8));
      setUnreadCount(unread.count);
    } catch {
      /* keep last good state */
    }
  }, [base, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  async function markRead(id: string) {
    await api(`${base}/${id}/read`, { method: "PATCH" });
    await refresh();
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await api(`${base}/read-all`, { method: "POST" });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return {
    items,
    unreadCount,
    open,
    setOpen,
    loading,
    listHref,
    refresh,
    markRead,
    markAllRead,
  };
}

export function NotificationBell({
  mode,
  enabled = true,
  placement = "auto",
}: {
  mode: Mode;
  enabled?: boolean;
  placement?: "auto" | "above" | "below";
}) {
  const router = useRouter();
  const {
    items,
    unreadCount,
    open,
    setOpen,
    loading,
    listHref,
    markRead,
    markAllRead,
  } = useNotifications(mode, enabled);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPanelStyle(null);
      return;
    }

    function position() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 16);
      const maxHeight = Math.min(440, window.innerHeight - 24);
      const spaceAbove = rect.top - 8;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const preferAbove =
        placement === "above" ||
        (placement === "auto" && (spaceAbove >= spaceBelow || spaceBelow < 200));

      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      left = Math.max(8, left);

      if (preferAbove) {
        const height = Math.min(maxHeight, Math.max(180, spaceAbove));
        setPanelStyle({
          position: "fixed",
          left,
          width,
          maxHeight: height,
          bottom: window.innerHeight - rect.top + 8,
          top: "auto",
        });
      } else {
        const height = Math.min(maxHeight, Math.max(180, spaceBelow));
        setPanelStyle({
          position: "fixed",
          left,
          width,
          maxHeight: height,
          top: rect.bottom + 8,
          bottom: "auto",
        });
      }
    }

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const panel = document.getElementById("ui-notif-panel");
      if (panel?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  async function openItem(item: NotificationItem) {
    if (!item.readAt) {
      await markRead(item.id);
    }
    setOpen(false);
    const href = hrefForNotification(mode, item);
    if (href) router.push(href);
  }

  const panel =
    open && mounted && panelStyle
      ? createPortal(
          <div
            id="ui-notif-panel"
            role="dialog"
            aria-label="Notifications"
            className="ui-notif__panel"
            style={panelStyle}
          >
            <div className="ui-notif__panel-head">
              <div className="ui-notif__panel-title">
                <span className="ui-notif__panel-icon" aria-hidden>
                  <BellIcon size={16} />
                </span>
                <div>
                  <strong>Notifications</strong>
                  <p>
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : items.length > 0
                        ? "You’re caught up"
                        : "No alerts yet"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ui-notif__action"
                disabled={loading || unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                {loading ? "Updating…" : "Mark all read"}
              </button>
            </div>

            <div className="ui-notif__panel-body">
              {items.length === 0 ? (
                <div className="ui-notif__empty">
                  <span className="ui-notif__empty-icon" aria-hidden>
                    <BellIcon size={22} />
                  </span>
                  <p>No notifications yet</p>
                  <span>Updates from messages, tasks, and appointments will show up here.</span>
                </div>
              ) : (
                <ul className="ui-notif__list">
                  {items.map((item) => (
                    <li key={item.id} className={item.readAt ? "is-read" : "is-unread"}>
                      <button type="button" className="ui-notif__item" onClick={() => void openItem(item)}>
                        <span className="ui-notif__dot" aria-hidden />
                        <span className="ui-notif__item-copy">
                          <span className="ui-notif__item-meta">
                            <span className="ui-notif__chip">{notificationTypeLabel(item.type)}</span>
                            <time>{formatDate(item.createdAt)}</time>
                          </span>
                          <strong>{item.title}</strong>
                          <span className="ui-notif__item-body">{item.body}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="ui-notif__panel-foot">
              <Link href={listHref} className="ui-notif__view-all" onClick={() => setOpen(false)}>
                View all notifications
              </Link>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="ui-notif">
      <button
        ref={buttonRef}
        type="button"
        className={`ui-notif__trigger${open ? " is-open" : ""}${unreadCount > 0 ? " has-unread" : ""}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ui-notif__icon">
          <BellIcon />
          {unreadCount > 0 ? (
            <span className="ui-notif__badge" aria-hidden>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
        <span className="ui-notif__label">Notification</span>
      </button>
      {panel}
    </div>
  );
}
