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
  Select,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { featureLabel, statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface FeatureRow {
  id: string;
  key: string;
  name: string;
  valueType: string;
  status: string;
}

export default function AdminFeaturesPage() {
  const [rows, setRows] = useState<FeatureRow[] | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [valueType, setValueType] = useState<"BOOLEAN" | "LIMIT">("BOOLEAN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setRows(await api<FeatureRow[]>("/api/v1/admin/features"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load features"));
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
      await api("/api/v1/admin/features", {
        method: "POST",
        body: JSON.stringify({ key, name, valueType }),
      });
      setKey("");
      setName("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to create feature"));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    setError(null);
    try {
      await api(`/api/v1/admin/features/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update feature"));
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Catalog"
        title="Features"
        description="Global catalog status is separate from practice entitlement. Disabling a feature globally still denies access through entitlements."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Add feature" tone="muted">
        <form onSubmit={(event) => void onCreate(event)} className="ui-admin-toolbar">
          <Field label="Key">
            <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="FEATURE_KEY" required />
          </Field>
          <Field label="Display name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required />
          </Field>
          <Field label="Type">
            <Select value={valueType} onChange={(event) => setValueType(event.target.value as "BOOLEAN" | "LIMIT")}>
              <option value="BOOLEAN">On / off</option>
              <option value="LIMIT">Limit</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      </Section>

      <Section title="Feature catalog">
        {rows === null ? <LoadingState>Loading features…</LoadingState> : null}
        {rows && rows.length === 0 ? <EmptyState title="No features yet">Create a feature to define plan capabilities.</EmptyState> : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Feature">
                    <strong>{row.name || featureLabel(row.key)}</strong>
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {featureLabel(row.key)}
                    </div>
                  </Td>
                  <Td label="Type">{humanizeLabel(row.valueType)}</Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(row.id, row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                    >
                      {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
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
