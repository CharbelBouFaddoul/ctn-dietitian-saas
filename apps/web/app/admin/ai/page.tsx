"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Section, Table, Td, TrendChart, type TrendPoint } from "@nutrition-saas/ui";
import { AdminPage } from "../_components/admin-page";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface PlatformUsage {
  periodKey: string;
  totals: { requests: number; tokens: number; costUsd: number };
  byDay: Array<{ date: string; requests: number; tokens: number; costUsd: number }>;
  items: Array<{
    dietitianAccountId: string;
    name: string;
    requests: number;
    tokens: number;
    costUsd: number;
    requestLimit: number | null;
    tokenLimit: number | null;
    requestPct: number | null;
    tokenPct: number | null;
  }>;
  total: number;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export default function AdminAiUsagePage() {
  const [data, setData] = useState<PlatformUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<PlatformUsage>("/api/v1/admin/ai/usage")
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load AI usage")));
  }, []);

  const points: TrendPoint[] = useMemo(
    () =>
      (data?.byDay ?? []).map((row) => ({
        at: `${row.date}T00:00:00.000Z`,
        primary: row.tokens,
        compare: row.costUsd,
      })),
    [data],
  );

  return (
    <AdminPage
      eyebrow="System"
      title="AI usage"
      description="Tokens, estimated USD, and request volume across all practices this month."
      error={error}
    >

      <div className="ui-kpi-strip ui-kpi-strip--3">
        <div className="ui-kpi">
          <span className="ui-kpi__label">Requests</span>
          <span className="ui-kpi__value">{data?.totals.requests ?? 0}</span>
        </div>
        <div className="ui-kpi">
          <span className="ui-kpi__label">Tokens</span>
          <span className="ui-kpi__value">{(data?.totals.tokens ?? 0).toLocaleString()}</span>
        </div>
        <div className="ui-kpi">
          <span className="ui-kpi__label">Estimated cost</span>
          <span className="ui-kpi__value">{formatUsd(data?.totals.costUsd ?? 0)}</span>
        </div>
      </div>

      <Section title="Daily tokens and cost">
        <TrendChart
          points={points}
          primaryLabel="Tokens"
          compareLabel="Cost"
          emptyTitle="No completed AI requests this month"
          height={160}
        />
      </Section>

      <Section title="Practices" description={`${data?.total ?? 0} with usage this period.`}>
        {!data?.items.length ? (
          <p className="ui-muted">No practice has used AI this month.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Practice</th>
                <th>Requests</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>% requests</th>
                <th>% tokens</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.dietitianAccountId}>
                  <Td label="Practice">
                    <Link href={`/admin/dietitians/${row.dietitianAccountId}`} className="ui-link">
                      {row.name}
                    </Link>
                  </Td>
                  <Td label="Requests">
                    {row.requests}
                    {row.requestLimit != null ? ` / ${row.requestLimit}` : ""}
                  </Td>
                  <Td label="Tokens">{row.tokens.toLocaleString()}</Td>
                  <Td label="Cost">{formatUsd(row.costUsd)}</Td>
                  <Td label="% requests">{row.requestPct != null ? `${row.requestPct}%` : "—"}</Td>
                  <Td label="% tokens">{row.tokenPct != null ? `${row.tokenPct}%` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </AdminPage>
  );
}
