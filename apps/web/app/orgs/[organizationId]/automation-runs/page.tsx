"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { humanizeLabel } from "@nutrition-saas/ui";
interface AutomationRun {
  id: string;
  automationRuleId: string;
  ruleName: string;
  triggerType: string;
  actionType: string;
  status: string;
  triggerKey: string;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export default function AutomationRunsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<AutomationRun[]>(`/api/v1/organizations/${organizationId}/automation-runs`)
      .then(setRuns)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to load runs"));
  }, [organizationId]);

  if (error) {
    return <main><p>{error}</p></main>;
  }

  return (
    <div>
      <p>
        <Link href={`/orgs/${organizationId}/automations`} style={{ color: "var(--color-accent)" }}>
          ← Automations
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Automation runs</h1>
      <table className="ui-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Status</th>
            <th>Trigger</th>
            <th>Started</th>
            <th>Failure</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <Link
                  href={`/orgs/${organizationId}/automations/${run.automationRuleId}`}
                  style={{ color: "var(--color-accent)" }}
                >
                  {run.ruleName}
                </Link>
              </td>
              <td>{humanizeLabel(run.status)}</td>
              <td>{humanizeLabel(run.triggerType)}</td>
              <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</td>
              <td>{run.errorMessage ?? run.errorCode ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 ? <p>No automation runs yet.</p> : null}
    </div>
  );
}
