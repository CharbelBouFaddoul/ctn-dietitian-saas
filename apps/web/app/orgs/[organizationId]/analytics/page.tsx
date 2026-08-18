"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, fieldStyle, inputStyle } from "../practice-shell";

const PERIODS = ["today", "this_week", "this_month", "last_30_days", "last_90_days"] as const;

export default function AnalyticsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("this_month");
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [financial, setFinancial] = useState<Record<string, unknown> | null>(null);
  const [clients, setClients] = useState<{ needsAttention: Array<{ clientName: string; reasons: string[] }> } | null>(null);
  const [activity, setActivity] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(selected = period) {
    const query = `?period=${selected}`;
    const [overviewData, financialData, clientData, activityData] = await Promise.all([
      api<Record<string, number>>(`/api/v1/organizations/${organizationId}/analytics/overview${query}`),
      api<Record<string, unknown>>(`/api/v1/organizations/${organizationId}/analytics/financial${query}`),
      api<{ needsAttention: Array<{ clientName: string; reasons: string[] }> }>(
        `/api/v1/organizations/${organizationId}/analytics/clients${query}`,
      ),
      api<Record<string, number>>(`/api/v1/organizations/${organizationId}/analytics/activity${query}`),
    ]);
    setOverview(overviewData);
    setFinancial(financialData);
    setClients(clientData);
    setActivity(activityData);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load analytics"));
  }, [organizationId, period]);

  return (
    <section>
      <h1>Analytics</h1>
      <p style={{ color: "var(--color-muted)" }}>Practice metrics calculated server-side using your organization timezone.</p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      <label style={fieldStyle}>
        Period
        <select style={inputStyle} value={period} onChange={(event) => setPeriod(event.target.value as (typeof PERIODS)[number])}>
          {PERIODS.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <button type="button" style={{ ...buttonStyle, marginBottom: 16 }} onClick={() => void load()}>
        Refresh
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Metric label="Active clients" value={overview?.activeClients} />
        <Metric label="New clients" value={overview?.newClients} />
        <Metric label="Unpaid invoices" value={overview?.unpaidInvoices} />
        <Metric label="Overdue invoices" value={overview?.overdueInvoices} />
        <Metric label="Invoiced (period)" value={overview?.invoicedAmount} money />
        <Metric label="Paid (period)" value={overview?.paidAmount} money />
        <Metric label="Tasks due" value={overview?.tasksDue} />
        <Metric label="Tasks overdue" value={overview?.tasksOverdue} />
        <Metric label="Food logs" value={activity?.foodLogs} />
        <Metric label="Water logs" value={activity?.waterLogs} />
        <Metric label="Exercise logs" value={activity?.exerciseLogs} />
      </div>

      <h2 style={{ marginTop: 24 }}>Needs attention</h2>
      <ul>
        {(clients?.needsAttention ?? []).map((row) => (
          <li key={row.clientName}>
            <strong>{row.clientName}</strong>: {row.reasons.join(" · ")}
          </li>
        ))}
      </ul>
      {(clients?.needsAttention ?? []).length === 0 ? <p>No clients flagged.</p> : null}

      <h2 style={{ marginTop: 24 }}>Financial summary</h2>
      <pre style={{ background: "var(--color-surface)", padding: 12, borderRadius: 8, overflow: "auto" }}>
        {JSON.stringify(financial, null, 2)}
      </pre>
    </section>
  );
}

function Metric({ label, value, money }: { label: string; value?: number; money?: boolean }) {
  const display = value === undefined ? "—" : money ? value.toFixed(2) : String(value);
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 13, color: "var(--color-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{display}</div>
    </div>
  );
}
