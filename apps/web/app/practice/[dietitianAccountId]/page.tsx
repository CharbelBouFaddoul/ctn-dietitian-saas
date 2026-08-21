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
  clientLimit: number | null;
  activeClients: number;
  unreadMessageCount: number;
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
  recentlyActive?: Array<{ clientId: string; clientName: string; clientEmail?: string | null }>;
  todayAppointments: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    status: string;
    clientId: string;
    clientName: string;
    clientEmail?: string | null;
  }>;
  upcomingAppointments: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    status: string;
    clientId: string;
    clientName: string;
    clientEmail?: string | null;
  }>;
  recentConversations: Array<{
    id: string;
    clientId: string;
    clientName: string;
    preview: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
  }>;
  recentNotifications: Array<{
    id: string;
    title: string;
    body: string;
    readAt: string | null;
    createdAt: string;
  }>;
  unreadNotificationCount: number;
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

function AppointmentTable({
  rows,
  dietitianAccountId,
}: {
  rows: Dashboard["todayAppointments"];
  dietitianAccountId: string;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <th>When</th>
          <th>Client</th>
          <th>Title</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <Td label="When">
              {formatDate(row.startAt)}
              {row.endAt ? ` – ${new Date(row.endAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
            </Td>
            <Td label="Client">
              <Link href={`/practice/${dietitianAccountId}/clients/${row.clientId}`} className="ui-link">
                {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
              </Link>
            </Td>
            <Td label="Title">{row.title}</Td>
            <Td label="Status">{humanizeLabel(row.status)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function PracticeDashboardPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const practice = usePractice();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api<Dashboard>(`/api/v1/dietitian/${dietitianAccountId}/practice/dashboard`)
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load dashboard")))
      .finally(() => setLoading(false));
  }, [dietitianAccountId]);

  const greeting = useMemo(() => greetingForNow(), []);
  const dateLabel = useMemo(() => todayLabel(), []);

  const metrics = [
    {
      tone: "clients" as const,
      label: "Clients",
      value: loading
        ? "—"
        : data?.clientLimit != null
          ? `${data.activeClients} / ${data.clientLimit}`
          : String(data?.activeClients ?? 0),
      hint:
        data?.clientLimit != null
          ? `Active / plan limit · ${data?.newClientsThisMonth ?? 0} new this month`
          : `${data?.newClientsThisMonth ?? 0} new this month`,
      icon: PracticeAccents.clients,
    },
    {
      tone: "tasks" as const,
      label: "Unread messages",
      value: loading ? "—" : String(data?.unreadMessageCount ?? 0),
      hint: `${data?.myTasks ?? 0} open tasks`,
      icon: PracticeAccents.messages,
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
            <Link href={`/practice/${dietitianAccountId}/clients`} className="ui-btn ui-btn--primary ui-btn--sm">
              Open clients
            </Link>
            <Link href={`/practice/${dietitianAccountId}/calendar`} className="ui-btn ui-btn--secondary ui-btn--sm">
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
        <Link href={`/practice/${dietitianAccountId}/clients`} className="ui-practice-quick__item">
          <span className="ui-practice-quick__icon">{PracticeAccents.clients}</span>
          <span>
            <strong>Clients</strong>
            <span className="ui-muted">Roster & records</span>
          </span>
        </Link>
        <Link href={`/practice/${dietitianAccountId}/messages`} className="ui-practice-quick__item">
          <span className="ui-practice-quick__icon">{PracticeAccents.messages}</span>
          <span>
            <strong>Messages</strong>
            <span className="ui-muted">Inbox</span>
          </span>
        </Link>
        <Link href={`/practice/${dietitianAccountId}/tasks`} className="ui-practice-quick__item">
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
            title="Today’s appointments"
            description="Scheduled for today."
            tone="mint"
            actions={
              <Link href={`/practice/${dietitianAccountId}/calendar`} className="ui-link">
                Calendar
              </Link>
            }
          >
            {loading ? (
              <Skeleton style={{ height: 60 }} />
            ) : (data?.todayAppointments ?? []).length === 0 ? (
              <EmptyState
                title="Nothing today"
                action={
                  <Link href={`/practice/${dietitianAccountId}/calendar`} className="ui-btn ui-btn--secondary ui-btn--sm">
                    Open calendar
                  </Link>
                }
              >
                No appointments scheduled for today.
              </EmptyState>
            ) : (
              <AppointmentTable rows={data!.todayAppointments} dietitianAccountId={dietitianAccountId} />
            )}
          </Section>

          <Section
            title="Upcoming"
            description="Next appointments after today."
            actions={
              <Link href={`/practice/${dietitianAccountId}/calendar`} className="ui-link">
                View calendar
              </Link>
            }
          >
            {loading ? (
              <Skeleton style={{ height: 60 }} />
            ) : (data?.upcomingAppointments ?? []).length === 0 ? (
              <EmptyState title="No upcoming appointments">Nothing booked after today.</EmptyState>
            ) : (
              <AppointmentTable rows={data!.upcomingAppointments} dietitianAccountId={dietitianAccountId} />
            )}
          </Section>

          <Section
            title="Recent messages"
            description="Latest conversations across clients."
            actions={
              <Link href={`/practice/${dietitianAccountId}/messages`} className="ui-link">
                View messages
              </Link>
            }
          >
            {loading ? (
              <Skeleton style={{ height: 48 }} />
            ) : (data?.recentConversations ?? []).length === 0 ? (
              <EmptyState title="No messages yet">Client conversations will appear here.</EmptyState>
            ) : (
              <ul className="ui-practice-list">
                {data!.recentConversations.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/practice/${dietitianAccountId}/messages?clientId=${row.clientId}`}
                      className="ui-link"
                    >
                      {row.clientName}
                    </Link>
                    <span className="ui-muted">
                      {row.preview ?? "—"}
                      {row.unreadCount > 0 ? ` · ${row.unreadCount} unread` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Notifications"
            description={
              data?.unreadNotificationCount
                ? `${data.unreadNotificationCount} unread`
                : "Recent practice alerts"
            }
            actions={
              <Link href={`/practice/${dietitianAccountId}/notifications`} className="ui-link">
                View all
              </Link>
            }
          >
            {loading ? (
              <Skeleton style={{ height: 48 }} />
            ) : (data?.recentNotifications ?? []).length === 0 ? (
              <EmptyState title="No notifications">You’re caught up.</EmptyState>
            ) : (
              <ul className="ui-practice-list">
                {data!.recentNotifications.map((row) => (
                  <li key={row.id}>
                    <strong>{row.title}</strong>
                    <span className="ui-muted">{row.body}</span>
                  </li>
                ))}
              </ul>
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
                    <Link href={`/practice/${dietitianAccountId}/clients/${row.clientId}`} className="ui-link">
                      {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                    </Link>
                    <span className="ui-muted">{row.reasons.map(humanizeLabel).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Recently active clients"
            description="Clients with recent practice activity."
            actions={
              <Link href={`/practice/${dietitianAccountId}/clients`} className="ui-link">
                View clients
              </Link>
            }
          >
            {loading ? (
              <Skeleton style={{ height: 48 }} />
            ) : (data?.recentlyActive ?? []).length === 0 ? (
              <EmptyState title="No recent clients">Client activity will appear here.</EmptyState>
            ) : (
              <ul className="ui-practice-list">
                {(data?.recentlyActive ?? []).map((row) => (
                  <li key={row.clientId}>
                    <Link href={`/practice/${dietitianAccountId}/clients/${row.clientId}`} className="ui-link">
                      {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                    </Link>
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
                {(data?.recentActivity ?? []).slice(0, 5).map((row) => (
                  <li key={row.id}>
                    <p>
                      <Link href={`/practice/${dietitianAccountId}/clients/${row.clientId}`} className="ui-link">
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
