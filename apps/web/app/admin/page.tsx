"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EmptyState,
  Section,
  Skeleton,
  StatusBadge,
} from "@nutrition-saas/ui";
import { AdminPage } from "./_components/admin-page";
import {
  auditActionLabel,
  healthBadgeTone,
  healthStatusLabel,
  scopedStatusLabel,
  statusLabel,
} from "../../lib/admin-labels";
import { api, API_URL } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { errorMessage } from "../../lib/humanize-error";

interface ListResponse {
  total?: number;
  items?: unknown[];
  newCount?: number;
}

interface AuditRow {
  id: string;
  action: string;
  result: string;
  createdAt: string;
  actor: { email: string } | null;
  dietitianAccount: { name: string } | null;
}

interface InboxRow {
  id: string;
  name: string;
  subject: string;
  createdAt: string;
  status: string;
}

interface InboxList {
  newCount?: number;
  items?: InboxRow[];
}

interface SubscriptionRow {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  dietitianAccount: { id: string; name: string } | null;
  plan: { name: string; slug: string };
}

function countFrom(payload: ListResponse | unknown[]): number {
  if (Array.isArray(payload)) return payload.length;
  return payload.total ?? payload.items?.length ?? 0;
}

function endingSoon(row: SubscriptionRow, now: number): boolean {
  if (row.plan.slug === "trial") return true;
  if (!row.currentPeriodEnd) return false;
  const end = new Date(row.currentPeriodEnd).getTime();
  if (Number.isNaN(end)) return false;
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  return end >= now && end <= now + fourteenDays;
}

export default function AdminHomePage() {
  const [clinics, setClinics] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<number | null>(null);
  const [subs, setSubs] = useState<number | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [inbox, setInbox] = useState<InboxRow[] | null>(null);
  const [attention, setAttention] = useState<SubscriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [clinicList, userList, subList, inboxList] = await Promise.all([
          api<ListResponse | unknown[]>("/api/v1/admin/dietitians"),
          api<ListResponse | unknown[]>("/api/v1/admin/users?scope=app&pageSize=1"),
          api<SubscriptionRow[]>("/api/v1/admin/subscriptions"),
          api<InboxList>("/api/v1/admin/contact-messages?status=NEW&pageSize=6"),
        ]);
        setClinics(countFrom(clinicList));
        setAccounts(countFrom(userList));
        setSubs(Array.isArray(subList) ? subList.length : countFrom(subList));
        setUnread(inboxList.newCount ?? inboxList.items?.length ?? 0);
        setInbox(inboxList.items ?? []);
        const now = Date.now();
        setAttention(
          (Array.isArray(subList) ? subList : []).filter((row) => endingSoon(row, now)).slice(0, 6),
        );
      } catch (err) {
        setError(errorMessage(err, "Unable to load overview"));
      }

      try {
        const result = (await fetch(`${API_URL}/health`).then((res) => res.json())) as { status?: string };
        setHealth(healthStatusLabel(result.status === "ok" ? "ok" : (result.status ?? "degraded")));
      } catch {
        setHealth("Unavailable");
      }

      try {
        const rows = await api<AuditRow[]>("/api/v1/admin/audit");
        setAudit(rows.slice(0, 6));
      } catch {
        setAudit(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const healthLabel = health ?? "—";

  return (
    <AdminPage
      eyebrow="Overview"
      title="Dashboard"
      description="What needs attention across clinics, subscriptions, inbox, and system health."
      error={error}
    >
      <div className="ui-admin-metrics" aria-label="Platform overview">
        {loading ? (
          [0, 1, 2, 3].map((key) => <Skeleton key={key} style={{ height: 88, borderRadius: 12 }} />)
        ) : (
          <>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Clinics</span>
              <strong className="ui-admin-metric__value">{clinics ?? "—"}</strong>
              <Link href="/admin/dietitians" className="ui-link" style={{ fontSize: 13 }}>
                Open clinics
              </Link>
            </div>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Accounts</span>
              <strong className="ui-admin-metric__value">{accounts ?? "—"}</strong>
              <Link href="/admin/users" className="ui-link" style={{ fontSize: 13 }}>
                Open accounts
              </Link>
            </div>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Subscriptions</span>
              <strong className="ui-admin-metric__value">{subs ?? "—"}</strong>
              <Link href="/admin/subscriptions" className="ui-link" style={{ fontSize: 13 }}>
                Open roster
              </Link>
            </div>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Inbox</span>
              <strong className="ui-admin-metric__value">{unread ?? "—"}</strong>
              <Link href="/admin/contact" className="ui-link" style={{ fontSize: 13 }}>
                {unread ? "Unread messages" : "Open inbox"}
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="ui-admin-home__grid">
        <Section
          title="Inbox"
          description="New messages from the public contact form."
          actions={
            <Link href="/admin/contact" className="ui-link">
              Open inbox
            </Link>
          }
        >
          {loading ? (
            <Skeleton style={{ height: 72, borderRadius: 10 }} />
          ) : inbox && inbox.length > 0 ? (
            <ul className="ui-admin-queue">
              {inbox.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/contact/${row.id}`} className="ui-link">
                    {row.subject}
                  </Link>
                  <span className="ui-muted">
                    {row.name} · {formatDate(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No new messages">The inbox is clear.</EmptyState>
          )}
        </Section>

        <Section
          title="Trials and renewals"
          description="Trial plans and subscriptions ending in the next 14 days."
          actions={
            <Link href="/admin/subscriptions" className="ui-link">
              Open roster
            </Link>
          }
        >
          {loading ? (
            <Skeleton style={{ height: 72, borderRadius: 10 }} />
          ) : attention && attention.length > 0 ? (
            <ul className="ui-admin-queue">
              {attention.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/admin/dietitians/${row.dietitianAccount?.id}?tab=subscription`}
                    className="ui-link"
                  >
                    {row.dietitianAccount?.name ?? "Clinic"}
                  </Link>
                  <span className="ui-muted">
                    {row.plan.name}
                    {row.currentPeriodEnd ? ` · ends ${formatDate(row.currentPeriodEnd)}` : " · open-ended"}
                    {" · "}
                    {scopedStatusLabel("subscription", row.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing due soon">No trials or upcoming period ends in this window.</EmptyState>
          )}
        </Section>
      </div>

      <div className="ui-admin-home__grid">
        <Section title="System health" description="Live status from the platform health endpoint." tone="mint">
          <div className="ui-admin-status-strip">
            <div className="ui-admin-status-row">
              <span>Overall</span>
              {loading ? (
                <span className="ui-muted">Checking…</span>
              ) : (
                <StatusBadge status={healthLabel} label={healthLabel} tone={healthBadgeTone(healthLabel)} />
              )}
            </div>
            <p className="ui-muted" style={{ margin: 0 }}>
              <Link href="/admin/health" className="ui-link">
                Open health details
              </Link>
            </p>
          </div>
        </Section>

        <Section
          title="Recent activity"
          description="Latest platform audit events."
          actions={
            <Link href="/admin/audit" className="ui-link">
              View audit
            </Link>
          }
        >
          {loading ? (
            <div className="ui-stack">
              <Skeleton style={{ height: 16, width: "80%" }} />
              <Skeleton style={{ height: 16, width: "65%" }} />
            </div>
          ) : audit && audit.length > 0 ? (
            <ul className="ui-admin-audit-list">
              {audit.map((row) => (
                <li key={row.id}>
                  <strong>{auditActionLabel(row.action)}</strong>
                  <span className="ui-muted">
                    {row.actor?.email ?? "System"}
                    {row.dietitianAccount?.name ? ` · ${row.dietitianAccount.name}` : ""} · {formatDate(row.createdAt)}
                    {" · "}
                    {statusLabel(row.result)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No recent activity">
              Audit events will appear here as platform changes are recorded.
            </EmptyState>
          )}
        </Section>
      </div>
    </AdminPage>
  );
}
