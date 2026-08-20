"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { auditActionLabel, statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { errorMessage } from "../../../lib/humanize-error";

interface AuditRow {
  id: string;
  action: string;
  result: string;
  targetType: string | null;
  createdAt: string;
  actor: { email: string } | null;
  organization: { name: string } | null;
  metadata: Record<string, unknown> | null;
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = q) {
    try {
      const path = search ? `/api/v1/admin/audit?q=${encodeURIComponent(search)}` : "/api/v1/admin/audit";
      setRows(await api<AuditRow[]>(path));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load audit logs"));
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
        eyebrow="Operations"
        title="Audit"
        description="Readable history of platform actions across organizations and users."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Activity history">
        <form onSubmit={onSearch} className="ui-admin-toolbar">
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search action" />
          </Field>
          <Button type="submit">Search</Button>
        </form>

        {rows === null ? <LoadingState>Loading audit…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No audit events">Matching activity will appear here.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Organization</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="When">{formatDate(row.createdAt)}</Td>
                  <Td label="Action">
                    <strong>{auditActionLabel(row.action)}</strong>
                    {row.targetType ? (
                      <div className="ui-muted" style={{ fontSize: 12 }}>
                        {auditActionLabel(row.targetType)}
                      </div>
                    ) : null}
                  </Td>
                  <Td label="Actor">{row.actor?.email ?? "System"}</Td>
                  <Td label="Organization">{row.organization?.name ?? "—"}</Td>
                  <Td label="Result">
                    <StatusBadge status={row.result} label={statusLabel(row.result)} />
                  </Td>
                  <Td label="Details">
                    {row.metadata && Object.keys(row.metadata).length > 0 ? (
                      <details className="ui-admin-details">
                        <summary>More details</summary>
                        <dl className="ui-admin-meta">
                          {Object.entries(row.metadata).map(([key, value]) => (
                            <div key={key} className="ui-admin-meta__row">
                              <dt>{auditActionLabel(key)}</dt>
                              <dd>{typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "—"}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
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
