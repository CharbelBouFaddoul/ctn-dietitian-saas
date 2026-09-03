"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { AdminListToolbar } from "../_components/admin-list-toolbar";
import { AdminPage } from "../_components/admin-page";
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
  dietitianAccount: { id?: string; name: string } | null;
  metadata: Record<string, unknown> | null;
}

interface ClinicOption {
  id: string;
  name: string;
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (action.trim()) params.set("action", action.trim());
      if (clinicId) params.set("dietitianAccountId", clinicId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      setRows(await api<AuditRow[]>(`/api/v1/admin/audit${suffix}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load audit logs"));
    }
  }

  useEffect(() => {
    void load();
    void api<ClinicOption[]>("/api/v1/admin/dietitians")
      .then(setClinics)
      .catch(() => setClinics([]));
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <AdminPage
      eyebrow="System"
      title="Audit"
      description="Readable history of platform actions across clinics and accounts."
      error={error}
    >
      <Section title="Activity history">
        <AdminListToolbar onSubmit={onSearch}>
          <Field label="Search">
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Action or target" />
          </Field>
          <Field label="Action">
            <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Exact action key" />
          </Field>
          <Field label="Clinic">
            <Select value={clinicId} onChange={(event) => setClinicId(event.target.value)}>
              <option value="">All clinics</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Search</Button>
        </AdminListToolbar>

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
                <th>Clinic</th>
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
                  <Td label="Clinic">{row.dietitianAccount?.name ?? "—"}</Td>
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
                              <dd>
                                {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                                  ? String(value)
                                  : "—"}
                              </dd>
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
    </AdminPage>
  );
}
