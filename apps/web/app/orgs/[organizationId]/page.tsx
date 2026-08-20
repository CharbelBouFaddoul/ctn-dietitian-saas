"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Card, EmptyState, PageHeader, StatCard, Table, Td, humanizeLabel } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { clientIdentityLine } from "../../../lib/client-identity";
import { errorMessage } from "../../../lib/humanize-error";
import { formatDate, formatMoney } from "../../../lib/format";

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

export default function PracticeDashboardPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Dashboard>(`/api/v1/organizations/${organizationId}/practice/dashboard`)
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load dashboard")));
  }, [organizationId]);

  return (
    <section>
      <PageHeader
        title="Today in your practice"
        description="What needs attention, who you’re seeing, and what’s still unpaid."
        actions={
          <Link href={`/orgs/${organizationId}/clients`} className="ui-btn ui-btn--primary">
            Open clients
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Active clients" value={data?.activeClients ?? "—"} hint={`${data?.newClientsThisMonth ?? 0} new this month`} />
        <StatCard label="My tasks" value={data?.myTasks ?? "—"} hint={`${data?.myOverdueTasks ?? 0} overdue`} />
        <StatCard label="Outstanding invoices" value={data?.outstandingInvoices ?? "—"} hint={`${data?.overdueInvoices ?? 0} overdue`} />
        <StatCard label="Paid this month" value={formatMoney(data?.paidThisMonth)} />
      </div>

      <div className="ui-stack">
        <Card title="Needs attention">
          {(data?.needsAttention ?? []).length === 0 ? (
            <EmptyState title="Nothing flagged">No clients need attention right now.</EmptyState>
          ) : (
            <ul>
              {(data?.needsAttention ?? []).map((row) => (
                <li key={row.clientId}>
                  <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                    {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                  </Link>
                  : {row.reasons.map(humanizeLabel).join(" · ")}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming appointments">
          {(data?.upcomingAppointments ?? []).length === 0 ? (
            <EmptyState title="No upcoming appointments">
              Schedule from a client workspace. A full practice calendar needs a list endpoint.
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
        </Card>

        <Card title="Recent activity">
          {(data?.recentActivity ?? []).length === 0 ? (
            <p className="ui-muted">No timeline activity yet.</p>
          ) : (
            <ul>
              {(data?.recentActivity ?? []).map((row) => (
                <li key={row.id}>
                  <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                    {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
                  </Link>{" "}
                  · {humanizeLabel(row.type)} · {formatDate(row.occurredAt)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
