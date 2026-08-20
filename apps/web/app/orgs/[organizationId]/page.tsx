"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  EmptyState,
  PageHeader,
  Section,
  Skeleton,
  StatCard,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { clientIdentityLine } from "../../../lib/client-identity";
import { errorMessage } from "../../../lib/humanize-error";
import { formatDate, formatMoney } from "../../../lib/format";
import { activityLabel } from "../../../lib/practice-labels";
import { usePractice } from "./practice-shell";

interface Dashboard {
  clientCount: number;
  activeClients: number;
  newClientsThisMonth: number;
  inactiveClients: number;
  tasksDueToday: number;
  tasksOverdue: number;
  myTasks: number;
  myOverdueTasks: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  paidThisMonth: number;
  invoicedThisMonth: number;
  needsAttention: Array<{ clientId: string; clientName: string; clientEmail?: string | null; reasons: string[] }>;
  upcomingAppointments: Array<{
    id: string;
    title: string;
    startAt: string;
    clientId: string;
    clientName: string;
    clientEmail?: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    occurredAt: string;
    clientId: string;
    clientName: string;
    clientEmail?: string | null;
  }>;
}

function greetingForNow(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function PracticeDashboardPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const practice = usePractice();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api<Dashboard>(`/api/v1/organizations/${organizationId}/practice/dashboard`)
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load dashboard")))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const greeting = useMemo(() => greetingForNow(), []);

  return (
    <section className="ui-practice-dash">
      <PageHeader
        title={greeting}
        description={`Here’s what’s happening in ${practice.name} today.`}
        actions={
          <div className="ui-row">
            <Link href={`/orgs/${organizationId}/calendar`} className="ui-btn ui-btn--secondary">
              Open calendar
            </Link>
            <Link href={`/orgs/${organizationId}/clients`} className="ui-btn ui-btn--primary">
              Open clients
            </Link>
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-practice-dash__layout">
        <div className="ui-practice-dash__primary">
          <Section
            title="Today’s schedule"
            description="Upcoming appointments from your practice calendar."
            tone="mint"
            actions={
              <Link href={`/orgs/${organizationId}/calendar`} className="ui-link">
                View all
              </Link>
            }
          >
            {loading ? (
              <div className="ui-stack">
                <Skeleton style={{ height: 18, width: "70%" }} />
                <Skeleton style={{ height: 18, width: "55%" }} />
                <Skeleton style={{ height: 18, width: "62%" }} />
              </div>
            ) : (data?.upcomingAppointments ?? []).length === 0 ? (
              <EmptyState title="No upcoming appointments" action={<Link href={`/orgs/${organizationId}/calendar`} className="ui-btn ui-btn--secondary ui-btn--sm">Open calendar</Link>}>
                Nothing scheduled yet. Book from a client workspace or the calendar.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Client</th>
                    <th>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.upcomingAppointments ?? []).map((row) => (
                    <tr key={row.id}>
                      <Td label="When">{formatDate(row.startAt)}</Td>
                      <Td label="Client">
                        <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                          {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                        </Link>
                      </Td>
                      <Td label="Title">{row.title}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>

          <Section title="Needs attention" description="Clients and work that may need a follow-up.">
            {loading ? (
              <div className="ui-stack">
                <Skeleton style={{ height: 16, width: "80%" }} />
                <Skeleton style={{ height: 16, width: "65%" }} />
              </div>
            ) : (data?.needsAttention ?? []).length === 0 ? (
              <EmptyState title="Nothing flagged">No clients need attention right now.</EmptyState>
            ) : (
              <ul className="ui-practice-list">
                {(data?.needsAttention ?? []).map((row) => (
                  <li key={row.clientId}>
                    <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                      {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                    </Link>
                    <span className="ui-muted">{row.reasons.map(humanizeLabel).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="ui-practice-dash__aside">
          <Section title="Practice overview" description="Snapshot from your practice data — not trend estimates.">
            <div className="ui-practice-stat-stack">
              <StatCard
                label="Active clients"
                value={loading ? "—" : (data?.activeClients ?? 0)}
                hint={`${data?.newClientsThisMonth ?? 0} new this month`}
              />
              <StatCard
                label="My tasks"
                value={loading ? "—" : (data?.myTasks ?? 0)}
                hint={`${data?.myOverdueTasks ?? 0} overdue`}
              />
              <StatCard
                label="Outstanding invoices"
                value={loading ? "—" : (data?.outstandingInvoices ?? 0)}
                hint={`${data?.overdueInvoices ?? 0} overdue`}
              />
              <StatCard label="Paid this month" value={loading ? "—" : formatMoney(data?.paidThisMonth)} />
            </div>
          </Section>

          <Section title="Recent activity">
            {loading ? (
              <div className="ui-stack">
                <Skeleton style={{ height: 14, width: "90%" }} />
                <Skeleton style={{ height: 14, width: "70%" }} />
              </div>
            ) : (data?.recentActivity ?? []).length === 0 ? (
              <p className="ui-muted">No recent activity yet.</p>
            ) : (
              <ol className="ui-practice-timeline">
                {(data?.recentActivity ?? []).map((row) => (
                  <li key={row.id}>
                    <p>
                      <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                        {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                      </Link>
                      <span> — {activityLabel(row.type)}</span>
                    </p>
                    <time className="ui-muted">{formatDate(row.occurredAt)}</time>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </aside>
      </div>
    </section>
  );
}
