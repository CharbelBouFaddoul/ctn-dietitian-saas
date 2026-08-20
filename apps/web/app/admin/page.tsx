"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  EmptyState,
  PageHeader,
  Section,
  Skeleton,
  StatusBadge,
} from "@nutrition-saas/ui";
import { api, API_URL } from "../../lib/api";
import { auditActionLabel, healthStatusLabel } from "../../lib/admin-labels";
import { formatDate } from "../../lib/format";
import { errorMessage } from "../../lib/humanize-error";

interface ListResponse {
  total?: number;
  items?: unknown[];
}

interface AuditRow {
  id: string;
  action: string;
  result: string;
  createdAt: string;
  actor: { email: string } | null;
  organization: { name: string } | null;
}

function countFrom(payload: ListResponse | unknown[]): number {
  if (Array.isArray(payload)) return payload.length;
  return payload.items?.length ?? payload.total ?? 0;
}

export default function AdminHomePage() {
  const [orgs, setOrgs] = useState<number | null>(null);
  const [users, setUsers] = useState<number | null>(null);
  const [subs, setSubs] = useState<number | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [orgList, userList, subList] = await Promise.all([
          api<ListResponse | unknown[]>("/api/v1/admin/organizations"),
          api<ListResponse | unknown[]>("/api/v1/admin/users"),
          api<ListResponse | unknown[]>("/api/v1/admin/subscriptions"),
        ]);
        setOrgs(countFrom(orgList));
        setUsers(countFrom(userList));
        setSubs(countFrom(subList));
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

  return (
    <section className="ui-admin-home">
      <PageHeader
        eyebrow="Platform"
        title="Dashboard"
        description="What is happening across organizations, members, and subscriptions."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-admin-metrics" aria-label="Platform overview">
        {loading ? (
          [0, 1, 2, 3].map((key) => <Skeleton key={key} style={{ height: 88, borderRadius: 12 }} />)
        ) : (
          <>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Organizations</span>
              <strong className="ui-admin-metric__value">{orgs ?? "—"}</strong>
              <Link href="/admin/organizations" className="ui-link" style={{ fontSize: 13 }}>
                Manage
              </Link>
            </div>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Users</span>
              <strong className="ui-admin-metric__value">{users ?? "—"}</strong>
              <Link href="/admin/users" className="ui-link" style={{ fontSize: 13 }}>
                Manage
              </Link>
            </div>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">Subscriptions</span>
              <strong className="ui-admin-metric__value">{subs ?? "—"}</strong>
              <Link href="/admin/subscriptions" className="ui-link" style={{ fontSize: 13 }}>
                Manage
              </Link>
            </div>
            <div className="ui-admin-metric">
              <span className="ui-admin-metric__label">System</span>
              <strong className="ui-admin-metric__value" style={{ fontSize: "1.05rem" }}>
                {health ?? "—"}
              </strong>
              <Link href="/admin/health" className="ui-link" style={{ fontSize: 13 }}>
                Health details
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="ui-admin-home__grid">
        <Section title="System status" description="Live status from the platform health endpoint." tone="mint">
          <div className="ui-admin-status-strip">
            <div className="ui-admin-status-row">
              <span>Overall</span>
              <StatusBadge status={health === "Operational" ? "ACTIVE" : "SUSPENDED"} label={health ?? "—"} />
            </div>
            <p className="ui-muted" style={{ margin: 0 }}>
              Open System health for individual service checks.
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
                    {row.organization?.name ? ` · ${row.organization.name}` : ""} · {formatDate(row.createdAt)}
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
    </section>
  );
}
