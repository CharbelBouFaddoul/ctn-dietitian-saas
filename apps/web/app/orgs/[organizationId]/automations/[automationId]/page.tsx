"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { cellStyle, pageStyle, tableStyle } from "../../practice-shell";

interface AutomationRule {
  id: string;
  name: string;
  status: string;
  summary: string;
  triggerType: string;
  actionType: string;
  configuration: unknown;
}

interface AutomationRun {
  id: string;
  status: string;
  triggerKey: string;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export default function AutomationDetailPage() {
  const params = useParams<{ organizationId: string; automationId: string }>();
  const { organizationId, automationId } = params;
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<AutomationRule>(`/api/v1/organizations/${organizationId}/automations/${automationId}`),
      api<AutomationRun[]>(`/api/v1/organizations/${organizationId}/automations/${automationId}/runs`),
    ])
      .then(([ruleData, runData]) => {
        setRule(ruleData);
        setRuns(runData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load automation"));
  }, [organizationId, automationId]);

  if (error) {
    return <main style={pageStyle}><p>{error}</p></main>;
  }
  if (!rule) {
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <div>
      <p>
        <Link href={`/orgs/${organizationId}/automations`} style={{ color: "var(--color-accent)" }}>
          ← Automations
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{rule.name}</h1>
      <p style={{ color: "var(--color-muted)" }}>{rule.summary}</p>
      <p>
        Status: <strong>{rule.status}</strong> · Trigger: {rule.triggerType} · Action: {rule.actionType}
      </p>

      <h2>Recent runs</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Trigger key</th>
            <th style={cellStyle}>Started</th>
            <th style={cellStyle}>Completed</th>
            <th style={cellStyle}>Retries</th>
            <th style={cellStyle}>Failure</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td style={cellStyle}>{run.status}</td>
              <td style={cellStyle}>{run.triggerKey}</td>
              <td style={cellStyle}>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</td>
              <td style={cellStyle}>{run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}</td>
              <td style={cellStyle}>{run.retryCount}</td>
              <td style={cellStyle}>{run.errorMessage ?? run.errorCode ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 ? <p>No runs recorded yet.</p> : null}
    </div>
  );
}
