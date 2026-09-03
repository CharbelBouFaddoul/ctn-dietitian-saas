"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, LoadingState, PageHeader, Section, StatusBadge } from "@nutrition-saas/ui";
import { statusLabel } from "../../../../lib/admin-labels";
import { api } from "../../../../lib/api";
import { formatDate } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";

interface ContactDetail {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "NEW" | "READ" | "ARCHIVED";
  planSlug: string | null;
  planName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
}

function statusTone(status: ContactDetail["status"]): "warning" | "info" | "neutral" {
  if (status === "NEW") return "warning";
  if (status === "READ") return "info";
  return "neutral";
}

function isLongMessage(message: string): boolean {
  return message.length > 360 || message.split("\n").length > 8;
}

export default function AdminContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api<ContactDetail>(`/api/v1/admin/contact-messages/${params.id}`);
      setItem(data);
      setError(null);
      if (data.status === "NEW") {
        const updated = await api<ContactDetail>(`/api/v1/admin/contact-messages/${params.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "READ" }),
        });
        setItem(updated);
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to load message"));
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function setStatus(status: ContactDetail["status"]) {
    setBusy(true);
    setError(null);
    try {
      setItem(
        await api<ContactDetail>(`/api/v1/admin/contact-messages/${params.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      );
    } catch (err) {
      setError(errorMessage(err, "Unable to update message"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this message? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/admin/contact-messages/${params.id}`, { method: "DELETE" });
      router.replace("/admin/contact");
    } catch (err) {
      setError(errorMessage(err, "Unable to delete message"));
      setBusy(false);
    }
  }

  if (!item && !error) {
    return <LoadingState>Loading message…</LoadingState>;
  }

  const long = item ? isLongMessage(item.message) : false;
  const replyHref = item
    ? `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Re: ${item.subject}`)}`
    : "#";

  return (
    <section>
      <PageHeader
        eyebrow="Operations"
        title={item?.subject || "Message"}
        description={item ? `From ${item.name}` : undefined}
        actions={
          <Link href="/admin/contact" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to inbox
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {item ? (
        <>
          <Section title="Details">
            <div className="ui-row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <StatusBadge status={item.status} label={statusLabel(item.status)} tone={statusTone(item.status)} />
              <a className="ui-btn ui-btn--primary ui-btn--sm" href={replyHref}>
                Reply
              </a>
              {item.status !== "NEW" ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void setStatus("NEW")}>
                  Mark unread
                </Button>
              ) : null}
              {item.status !== "ARCHIVED" ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void setStatus("ARCHIVED")}>
                  Archive
                </Button>
              ) : (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void setStatus("READ")}>
                  Move to inbox
                </Button>
              )}
              <Button variant="danger" size="sm" disabled={busy} onClick={() => void onDelete()}>
                Delete
              </Button>
            </div>
            <dl className="ui-admin-meta">
              <div className="ui-admin-meta__row">
                <dt>From</dt>
                <dd>
                  {item.name} ·{" "}
                  <a className="ui-link" href={`mailto:${item.email}`}>
                    {item.email}
                  </a>
                </dd>
              </div>
              <div className="ui-admin-meta__row">
                <dt>Received</dt>
                <dd>{formatDate(item.createdAt)}</dd>
              </div>
              {item.planName ? (
                <div className="ui-admin-meta__row">
                  <dt>Plan</dt>
                  <dd>
                    {item.planName}
                    {item.planSlug ? ` (${item.planSlug})` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Section>

          <Section title="Message">
            <div className={long ? "ui-admin-message ui-admin-message--long" : "ui-admin-message"}>{item.message}</div>
          </Section>
        </>
      ) : null}
    </section>
  );
}
