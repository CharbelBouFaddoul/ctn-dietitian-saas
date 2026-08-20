"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { humanizeLabel } from "@nutrition-saas/ui";
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
    return <main><p>{error}</p></main>;
  }
  if (!rule) {
    return <main>Loading…</main>;
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
        Status: <strong>{humanizeLabel(rule.status)}</strong> · When: {humanizeLabel(rule.triggerType)} · Then:{" "}
        {humanizeLabel(rule.actionType)}
      </p>

      <h2>Recent runs</h2>
      <table className="ui-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>When</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Retries</th>
            <th>Failure</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{humanizeLabel(run.status)}</td>
              <td>{humanizeLabel(run.triggerKey)}</td>
              <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</td>
              <td>{run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}</td>
              <td>{run.retryCount}</td>
              <td>{run.errorMessage ?? run.errorCode ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 ? <p>No runs recorded yet.</p> : null}
    </div>
  );
}
