"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  EmptyState,
  Section,
  Skeleton,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { clientIdentityLine } from "../../../lib/client-identity";
import { errorMessage } from "../../../lib/humanize-error";
import { formatDate, formatMoney } from "../../../lib/format";
import { activityLabel } from "../../../lib/practice-labels";
import { PracticeAccents } from "./practice-accents";
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

function todayLabel(now = new Date()): string {
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
  const dateLabel = useMemo(() => todayLabel(), []);

  const metrics = [
    {
      tone: "clients" as const,
      label: "Active clients",
      value: loading ? "—" : String(data?.activeClients ?? 0),
      hint: `${data?.newClientsThisMonth ?? 0} new this month`,
      icon: PracticeAccents.clients,
    },
    {
      tone: "tasks" as const,
      label: "My tasks",
      value: loading ? "—" : String(data?.myTasks ?? 0),
      hint: `${data?.myOverdueTasks ?? 0} overdue`,
      icon: PracticeAccents.tasks,
    },
    {
      tone: "billing" as const,
      label: "Outstanding",
      value: loading ? "—" : String(data?.outstandingInvoices ?? 0),
      hint: `${data?.overdueInvoices ?? 0} overdue`,
      icon: PracticeAccents.billing,
    },
    {
      tone: "paid" as const,
      label: "Paid this month",
      value: loading ? "—" : formatMoney(data?.paidThisMonth),
      hint: data?.invoicedThisMonth != null ? `Invoiced ${formatMoney(data.invoicedThisMonth)}` : undefined,
      icon: PracticeAccents.paid,
    },
  ];

  return (
    <section className="ui-practice-dash">
      <header className="ui-practice-welcome">
        <div className="ui-practice-welcome__copy">
          <p className="ui-practice-welcome__eyebrow">{dateLabel}</p>
          <h1>{greeting}</h1>
          <p>Here’s what’s happening in {practice.name} today — clients, schedule, and follow-ups.</p>
          <div className="ui-practice-welcome__actions">
            <Link href={`/practice/${organizationId}/clients`} className="ui-btn ui-btn--primary ui-btn--sm">
              Open clients
            </Link>
            <Link href={`/practice/${organizationId}/calendar`} className="ui-btn ui-btn--secondary ui-btn--sm">
              Open calendar
            </Link>
          </div>
        </div>
        <div className="ui-practice-welcome__orb" aria-hidden="true" />
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-practice-metrics" aria-label="Practice overview">
        {loading
          ? [0, 1, 2, 3].map((key) => <Skeleton key={key} style={{ height: 96, borderRadius: 14 }} />)
          : metrics.map((metric) => (
              <div key={metric.tone} className="ui-practice-metric" data-tone={metric.tone}>
                <span className="ui-practice-metric__icon">{metric.icon}</span>
                <span className="ui-practice-metric__label">{metric.label}</span>
                <strong className="ui-practice-metric__value">{metric.value}</strong>
                {metric.hint ? <span className="ui-practice-metric__hint">{metric.hint}</span> : null}
              </div>
            ))}
      </div>

      <nav className="ui-practice-quick" aria-label="Quick links">
        <Link href={`/practice/${organizationId}/clients`} className="ui-practice-quick__item" data-tone="clients">
          <span className="ui-practice-quick__icon">{PracticeAccents.clients}</span>
          <span>
            <strong>Clients</strong>
            <span className="ui-muted">Roster & profiles</span>
          </span>
        </Link>
        <Link href={`/practice/${organizationId}/calendar`} className="ui-practice-quick__item" data-tone="schedule">
          <span className="ui-practice-quick__icon">{PracticeAccents.schedule}</span>
          <span>
            <strong>Calendar</strong>
            <span className="ui-muted">Appointments</span>
          </span>
        </Link>
        <Link href={`/practice/${organizationId}/messages`} className="ui-practice-quick__item" data-tone="messages">
          <span className="ui-practice-quick__icon">{PracticeAccents.messages}</span>
          <span>
            <strong>Messages</strong>
            <span className="ui-muted">Client conversations</span>
          </span>
        </Link>
        <Link href={`/practice/${organizationId}/tasks`} className="ui-practice-quick__item" data-tone="tasks">
          <span className="ui-practice-quick__icon">{PracticeAccents.tasks}</span>
          <span>
            <strong>Tasks</strong>
            <span className="ui-muted">Due & overdue work</span>
          </span>
        </Link>
      </nav>

      <div className="ui-practice-dash__layout">
        <div className="ui-practice-dash__primary">
          <Section
            title="Today’s schedule"
            description="Upcoming appointments from your practice calendar."
            tone="mint"
            actions={
              <Link href={`/practice/${organizationId}/calendar`} className="ui-link">
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
              <EmptyState
                title="No upcoming appointments"
                action={
                  <Link href={`/practice/${organizationId}/calendar`} className="ui-btn ui-btn--secondary ui-btn--sm">
                    Open calendar
                  </Link>
                }
              >
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
                        <Link href={`/practice/${organizationId}/clients/${row.clientId}`} className="ui-link">
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
                    <Link href={`/practice/${organizationId}/clients/${row.clientId}`} className="ui-link">
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
          <Section title="Recent activity" description="Latest client and practice events.">
            {loading ? (
              <div className="ui-stack">
                <Skeleton style={{ height: 14, width: "90%" }} />
                <Skeleton style={{ height: 14, width: "70%" }} />
              </div>
            ) : (data?.recentActivity ?? []).length === 0 ? (
              <p className="ui-muted" style={{ margin: 0 }}>
                No recent activity yet.
              </p>
            ) : (
              <ol className="ui-practice-timeline">
                {(data?.recentActivity ?? []).map((row) => (
                  <li key={row.id}>
                    <p>
                      <Link href={`/practice/${organizationId}/clients/${row.clientId}`} className="ui-link">
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
