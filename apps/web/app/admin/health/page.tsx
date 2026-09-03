"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  EmptyState,
  LoadingState,
  Section,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { healthBadgeTone, healthStatusLabel } from "../../../lib/admin-labels";
import { AdminPage } from "../_components/admin-page";
import { API_URL } from "../../../lib/api";
import { humanizeLabel } from "@nutrition-saas/ui";

interface HealthPayload {
  status?: string;
  checks?: Record<string, { status?: string; message?: string } | string>;
}

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`${API_URL}/health`)
      .then(async (res) => {
        const payload = (await res.json()) as HealthPayload;
        setData(payload);
        if (!res.ok) setError("One or more checks are failing.");
      })
      .catch(() => setError("Unable to reach the API health endpoint."))
      .finally(() => setLoading(false));
  }, []);

  const overall = healthStatusLabel(data?.status === "ok" ? "ok" : (data?.status ?? (loading ? null : "unavailable")));
  const checks = data?.checks
    ? Object.entries(data.checks).map(([name, value]) => ({
        name,
        status: typeof value === "string" ? value : (value.status ?? "unknown"),
        message: typeof value === "string" ? "" : (value.message ?? ""),
      }))
    : [];

  return (
    <AdminPage
      eyebrow="System"
      title="Health"
      description="Live checks for API, database, and related services."
    >
      {error ? <Alert tone="warning">{error}</Alert> : null}

      <Section title="Overall status" tone="mint">
        {loading ? (
          <LoadingState>Checking health…</LoadingState>
        ) : (
          <div className="ui-admin-status-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <strong style={{ fontSize: "1.25rem" }}>{overall}</strong>
              <p className="ui-muted" style={{ margin: "0.25rem 0 0" }}>
                Platform status from the health endpoint.
              </p>
            </div>
            <StatusBadge status={overall === "Operational" ? "ACTIVE" : overall} label={overall} tone={healthBadgeTone(overall)} />
          </div>
        )}
      </Section>

      <Section title="Services">
        {loading ? <LoadingState>Loading checks…</LoadingState> : null}
        {!loading && checks.length === 0 ? (
          <EmptyState title="No check details">The health endpoint did not return individual services.</EmptyState>
        ) : null}
        {checks.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((row) => {
                const label = healthStatusLabel(row.status);
                return (
                  <tr key={row.name}>
                    <Td label="Service">{humanizeLabel(row.name)}</Td>
                    <Td label="Status">
                      <StatusBadge status={label === "Operational" ? "ACTIVE" : label} label={label} tone={healthBadgeTone(label)} />
                    </Td>
                    <Td label="Detail">{row.message || "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </AdminPage>
  );
}
