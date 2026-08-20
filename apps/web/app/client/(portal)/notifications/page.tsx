"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, EmptyState, LoadingState, PageHeader } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { formatDate } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";
import {
  notificationTypeLabel,
  type NotificationItem,
} from "../../../../lib/use-notifications";

export default function ClientNotificationsPage() {
  const base = "/api/v1/portal/notifications";
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await api<NotificationItem[]>(base));
    } catch (err) {
      setError(errorMessage(err, "Unable to load notifications"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const unreadCount = useMemo(() => items.filter((row) => !row.readAt).length, [items]);

  async function markAll() {
    setWorking(true);
    try {
      await api(`${base}/read-all`, { method: "POST" });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to mark notifications read"));
    } finally {
      setWorking(false);
    }
  }

  async function markOne(id: string) {
    await api(`${base}/${id}/read`, { method: "PATCH" });
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)),
    );
  }

  if (loading) {
    return <LoadingState>Loading notifications…</LoadingState>;
  }

  return (
    <section className="ui-notif-page">
      <PageHeader
        eyebrow="Portal"
        title="Notifications"
        description="Updates for your active practice connection."
        actions={
          <div className="ui-notif-page__actions">
            <Link href="/client" className="ui-btn ui-btn--ghost ui-btn--sm">
              Home
            </Link>
            <Button variant="secondary" size="sm" disabled={working || unreadCount === 0} onClick={() => void markAll()}>
              {working ? "Updating…" : "Mark all read"}
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-notif-page__summary">
        <div>
          <strong>{items.length}</strong>
          <span>Total</span>
        </div>
        <div>
          <strong>{unreadCount}</strong>
          <span>Unread</span>
        </div>
        <div>
          <strong>{items.length - unreadCount}</strong>
          <span>Read</span>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No notifications yet">
          Messages, appointments, and invoices from your dietitian will show up here.{" "}
          <Link href="/client" className="ui-link">
            Back to home
          </Link>
        </EmptyState>
      ) : (
        <ul className="ui-notif-feed">
          {items.map((item) => (
            <li key={item.id} className={item.readAt ? "is-read" : "is-unread"}>
              <button type="button" className="ui-notif-feed__card" onClick={() => void markOne(item.id)}>
                <span className="ui-notif-feed__rail" aria-hidden />
                <span className="ui-notif-feed__content">
                  <span className="ui-notif-feed__meta">
                    <span className="ui-notif__chip">{notificationTypeLabel(item.type)}</span>
                    <time>{formatDate(item.createdAt)}</time>
                    {!item.readAt ? <span className="ui-notif-feed__new">New</span> : null}
                  </span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  {!item.readAt ? <span className="ui-notif-feed__hint">Click to mark as read</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
