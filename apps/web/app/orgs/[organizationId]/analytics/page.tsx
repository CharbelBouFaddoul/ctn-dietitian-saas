"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  StatCard,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { clientIdentityLine } from "../../../../lib/client-identity";
import { formatMoney } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";

const PERIODS = ["today", "this_week", "this_month", "last_30_days", "last_90_days"] as const;

interface Financial {
  currency?: string;
  outstanding?: { count: number; total: number };
  overdue?: { count: number; total: number };
  paidThisPeriod?: { count: number; total: number };
  invoicedThisPeriod?: { count: number; total: number };
  byStatus?: Array<{ status: string; count: number; total: number }>;
}

export default function AnalyticsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("this_month");
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [financial, setFinancial] = useState<Financial | null>(null);
  const [clients, setClients] = useState<{
    needsAttention: Array<{ clientId: string; clientName: string; clientEmail?: string | null; reasons: string[] }>;
  } | null>(null);
  const [activity, setActivity] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(selected = period) {
    const query = `?period=${selected}`;
    const [overviewData, financialData, clientData, activityData] = await Promise.all([
      api<Record<string, number>>(`/api/v1/organizations/${organizationId}/analytics/overview${query}`),
      api<Financial>(`/api/v1/organizations/${organizationId}/analytics/financial${query}`),
      api<{
        needsAttention: Array<{ clientId: string; clientName: string; clientEmail?: string | null; reasons: string[] }>;
      }>(`/api/v1/organizations/${organizationId}/analytics/clients${query}`),
      api<Record<string, number>>(`/api/v1/organizations/${organizationId}/analytics/activity${query}`),
    ]);
    setOverview(overviewData);
    setFinancial(financialData);
    setClients(clientData);
    setActivity(activityData);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load analytics")));
  }, [organizationId, period]);

  const currency = financial?.currency ?? "USD";

  return (
    <section>
      <PageHeader
        title="Analytics"
        description="Practice metrics using your organization timezone."
        actions={
          <div className="ui-row">
            <Field label="Period">
              <Select value={period} onChange={(event) => setPeriod(event.target.value as (typeof PERIODS)[number])}>
                {PERIODS.map((value) => (
                  <option key={value} value={value}>
                    {humanizeLabel(value)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-grid">
        <StatCard label="Active clients" value={overview?.activeClients ?? "—"} />
        <StatCard label="New clients" value={overview?.newClients ?? "—"} />
        <StatCard label="Unpaid invoices" value={overview?.unpaidInvoices ?? "—"} />
        <StatCard label="Overdue invoices" value={overview?.overdueInvoices ?? "—"} />
        <StatCard label="Invoiced" value={formatMoney(overview?.invoicedAmount, currency)} />
        <StatCard label="Paid" value={formatMoney(overview?.paidAmount, currency)} />
        <StatCard label="Tasks due" value={overview?.tasksDue ?? "—"} />
        <StatCard label="Food logs" value={activity?.foodLogs ?? "—"} />
      </div>

      <h2 style={{ marginTop: 28 }}>Needs attention</h2>
      {(clients?.needsAttention ?? []).length === 0 ? (
        <EmptyState title="No clients flagged">Nothing needs attention in this period.</EmptyState>
      ) : (
        <ul>
          {(clients?.needsAttention ?? []).map((row) => (
            <li key={row.clientId}>
              <Link href={`/orgs/${organizationId}/clients/${row.clientId}`} className="ui-link">
                {clientIdentityLine({ id: row.clientId, displayName: row.clientName, email: row.clientEmail })}
              </Link>
              : {row.reasons.map(humanizeLabel).join(" · ")}
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 28 }}>Financial summary</h2>
      <div className="ui-grid" style={{ marginBottom: 16 }}>
        <StatCard
          label="Outstanding"
          value={formatMoney(financial?.outstanding?.total, currency)}
          hint={`${financial?.outstanding?.count ?? 0} invoices`}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(financial?.overdue?.total, currency)}
          hint={`${financial?.overdue?.count ?? 0} invoices`}
        />
        <StatCard
          label="Paid this period"
          value={formatMoney(financial?.paidThisPeriod?.total, currency)}
          hint={`${financial?.paidThisPeriod?.count ?? 0} invoices`}
        />
        <StatCard
          label="Invoiced this period"
          value={formatMoney(financial?.invoicedThisPeriod?.total, currency)}
          hint={`${financial?.invoicedThisPeriod?.count ?? 0} invoices`}
        />
      </div>
      {(financial?.byStatus ?? []).length ? (
        <Table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(financial?.byStatus ?? []).map((row) => (
              <tr key={row.status}>
                <Td label="Status">{humanizeLabel(row.status)}</Td>
                <Td label="Count">{row.count}</Td>
                <Td label="Total">{formatMoney(row.total, currency)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </section>
  );
}
