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
  Section,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { clientIdentityLine } from "../../../../lib/client-identity";
import { formatMoney } from "../../../../lib/format";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

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
  const [loading, setLoading] = useState(true);

  async function load(selected = period) {
    setLoading(true);
    setError(null);
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
    void load()
      .catch((err) => setError(errorMessage(err, "Unable to load analytics")))
      .finally(() => setLoading(false));
  }, [organizationId, period]);

  const currency = financial?.currency ?? "USD";
  const value = (n: number | undefined) => (loading || overview == null ? "—" : (n ?? 0));

  return (
    <section>
      <PageHeader
        title="Analytics"
        description={`Snapshot for ${humanizeLabel(period)}. Figures reflect your practice timezone — not invented trends.`}
        actions={
          <div className="ui-row">
            <Field label="Period">
              <Select value={period} onChange={(event) => setPeriod(event.target.value as (typeof PERIODS)[number])}>
                {PERIODS.map((valueOption) => (
                  <option key={valueOption} value={valueOption}>
                    {humanizeLabel(valueOption)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              onClick={() =>
                void load()
                  .catch((err) => setError(errorMessage(err, "Unable to load analytics")))
                  .finally(() => setLoading(false))
              }
            >
              Refresh
            </Button>
          </div>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Overview" description="Key counts for the selected period.">
        {loading && !overview ? (
          <div className="ui-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} style={{ height: 88, width: "100%" }} />
            ))}
          </div>
        ) : (
          <div className="ui-grid">
            <StatCard label="Active clients" value={value(overview?.activeClients)} />
            <StatCard label="New clients" value={value(overview?.newClients)} />
            <StatCard label="Unpaid invoices" value={value(overview?.unpaidInvoices)} />
            <StatCard label="Overdue invoices" value={value(overview?.overdueInvoices)} />
            <StatCard label="Invoiced" value={loading ? "—" : formatMoney(overview?.invoicedAmount, currency)} />
            <StatCard label="Paid" value={loading ? "—" : formatMoney(overview?.paidAmount, currency)} />
            <StatCard label="Tasks due" value={value(overview?.tasksDue)} />
            <StatCard label="Food logs" value={loading || !activity ? "—" : (activity.foodLogs ?? 0)} />
          </div>
        )}
      </Section>

      <div className="ui-practice-dash__layout">
        <Section title="Needs attention" description="Clients flagged in this period.">
          {(clients?.needsAttention ?? []).length === 0 ? (
            <EmptyState title="No clients flagged">Nothing needs attention in this period.</EmptyState>
          ) : (
            <ul className="ui-practice-list">
              {(clients?.needsAttention ?? []).map((row) => (
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

        <Section title="Financial summary" description="Invoice totals for the selected period." tone="muted">
          <div className="ui-practice-stat-stack" style={{ marginBottom: 16 }}>
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
                    <Td label="Status">
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                    </Td>
                    <Td label="Count">{row.count}</Td>
                    <Td label="Total">{formatMoney(row.total, currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="ui-muted">No invoice status breakdown for this period.</p>
          )}
        </Section>
      </div>
    </section>
  );
}
