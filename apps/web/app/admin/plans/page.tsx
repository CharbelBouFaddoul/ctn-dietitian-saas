"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
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
  _count?: { subscriptions: number };
}

export default function AdminPlansPage() {
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/admin/plans", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      setName("");
      setSlug("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to create plan"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Commerce"
        title="Plans"
        description="Referenced plans cannot be deleted. Deactivate or archive instead — existing subscriptions keep working."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Create plan" tone="muted">
        <form onSubmit={(event) => void onCreate(event)} className="ui-admin-toolbar">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Plan name" required />
          </Field>
          <Field label="Slug">
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="slug" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      </Section>

      <Section title="All plans">
        {rows === null ? <LoadingState>Loading plans…</LoadingState> : null}
        {rows && rows.length === 0 ? <EmptyState title="No plans yet">Create a plan to get started.</EmptyState> : null}
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
                </p>
                <p style={{ margin: 0, fontWeight: 650 }}>
                  {row._count?.subscriptions ?? 0} subscription{(row._count?.subscriptions ?? 0) === 1 ? "" : "s"}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </Section>
    </section>
  );
}
