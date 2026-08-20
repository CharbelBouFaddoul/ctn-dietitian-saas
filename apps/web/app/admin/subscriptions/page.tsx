"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
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
      <table className="ui-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Plan</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/admin/organizations/${row.organization.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.organization.name}
                </Link>
              </td>
              <td>{row.plan.name}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
