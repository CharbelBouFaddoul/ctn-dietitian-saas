"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { cellStyle, tableStyle } from "../admin-shell";

interface SubscriptionRow {
  id: string;
  status: string;
  organization: { id: string; name: string };
  plan: { name: string; slug: string };
}

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<SubscriptionRow[]>("/api/v1/admin/subscriptions")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load subscriptions"));
  }, []);

  return (
    <section>
      <h1>Subscriptions</h1>
      <p style={{ color: "var(--color-muted)" }}>One subscription per organization. No payment UI in V1.</p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Organization</th>
            <th style={cellStyle}>Plan</th>
            <th style={cellStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/admin/organizations/${row.organization.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.organization.name}
                </Link>
              </td>
              <td style={cellStyle}>{row.plan.name}</td>
              <td style={cellStyle}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
