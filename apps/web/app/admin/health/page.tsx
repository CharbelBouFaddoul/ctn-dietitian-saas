"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, PageHeader, StatCard, Table, Td } from "@nutrition-saas/ui";
import { API_URL } from "../../../lib/api";

interface HealthPayload {
  status?: string;
  checks?: Record<string, { status?: string; message?: string } | string>;
}

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${API_URL}/health`)
      .then(async (res) => {
        const payload = (await res.json()) as HealthPayload;
        setData(payload);
        if (!res.ok) setError("One or more checks are failing.");
      })
      .catch(() => setError("Unable to reach the API health endpoint."));
  }, []);

  const checks = data?.checks
    ? Object.entries(data.checks).map(([name, value]) => ({
        name,
        status: typeof value === "string" ? value : (value.status ?? "unknown"),
        message: typeof value === "string" ? "" : (value.message ?? ""),
      }))
    : [];

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title="System health"
        description="Live checks for API, database, Redis, and storage. No extra backend was added for this screen."
      />
      {error ? <Alert tone="warning">{error}</Alert> : null}
      <div className="ui-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Status" value={data?.status === "ok" ? "Healthy" : (data?.status ?? "—")} />
        <StatCard label="Checks" value={checks.length || "—"} />
      </div>
      {checks.length ? (
        <Table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((row) => (
              <tr key={row.name}>
                <Td label="Check">{row.name}</Td>
                <Td label="Status">
                  <Badge tone={row.status === "ok" || row.status === "up" ? "success" : "danger"}>{row.status}</Badge>
                </Td>
                <Td label="Detail">{row.message || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="ui-muted">Waiting for health details…</p>
      )}
    </section>
  );
}
