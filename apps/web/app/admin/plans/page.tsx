"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@nutrition-saas/ui";
import { statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  durationDays?: number;
  showPrice?: boolean;
  listedPublicly?: boolean;
  priceCents?: number | null;
  currency?: string;
  _count?: { subscriptions: number };
}

export default function AdminPlansPage() {
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await api<PlanRow[]>("/api/v1/admin/plans"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load plans"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section>
      <PageHeader
        eyebrow="Commerce"
        title="Plans"
        description="Referenced plans cannot be deleted. Deactivate or archive instead — existing subscriptions keep working."
        actions={
          <Link href="/admin/plans/new" className="ui-btn ui-btn--primary ui-btn--sm">
            Create plan
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="All plans">
        {rows === null ? <LoadingState>Loading plans…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No plans yet">Create a plan to get started.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <div className="ui-admin-plan-grid">
            {rows.map((row) => (
              <article key={row.id} className="ui-admin-plan-card">
                <div className="ui-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                  <h3>
                    <Link href={`/admin/plans/${row.id}`} className="ui-link">
                      {row.name}
                    </Link>
                  </h3>
                  <StatusBadge status={row.status} label={statusLabel(row.status)} />
                </div>
                <p className="ui-muted" style={{ margin: "0 0 0.5rem", fontSize: 13 }}>
                  {row.slug}
                  {row.durationDays ? ` · ${row.durationDays} days` : ""}
                  {row.showPrice && row.priceCents != null
                    ? ` · ${(row.priceCents / 100).toFixed(2)} ${row.currency || "USD"}`
                    : row.showPrice === false
                      ? " · price hidden"
                      : ""}
                  {row.listedPublicly === false ? " · hidden from website" : ""}
                </p>
                <p style={{ margin: 0, fontWeight: 650 }}>
                  {row._count?.subscriptions ?? 0} subscription
                  {(row._count?.subscriptions ?? 0) === 1 ? "" : "s"}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </Section>
    </section>
  );
}
