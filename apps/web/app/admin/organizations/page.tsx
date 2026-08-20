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
  Table,
  Td,
} from "@nutrition-saas/ui";
import { statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription: { status: string; plan: { name: string; slug: string } } | null;
}

export default function AdminOrganizationsPage() {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/organizations?q=${encodeURIComponent(search)}` : "/api/v1/admin/organizations";
      setRows(await api<OrgRow[]>(path));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load organizations"));
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load(q);
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="Organizations"
        description="Practices on the platform — status, plan, and subscription."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="All organizations">
        <form onSubmit={onSearch} className="ui-admin-toolbar">
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name or slug" />
          </Field>
          <Button type="submit">Search</Button>
        </form>

        {rows === null ? <LoadingState>Loading organizations…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No organizations found">Try a different search, or wait for practices to join.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Subscription</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Organization">
                    <Link href={`/admin/organizations/${row.id}`} className="ui-link">
                      {row.name}
                    </Link>
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {row.slug}
                    </div>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Plan">{row.subscription?.plan.name ?? "None"}</Td>
                  <Td label="Subscription">
                    {row.subscription ? (
                      <StatusBadge status={row.subscription.status} label={statusLabel(row.subscription.status)} />
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </section>
  );
}
