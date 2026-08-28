"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { automationActionLabel, automationTriggerLabel } from "../../../../lib/automation-labels";
import { errorMessage } from "../../../../lib/humanize-error";

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
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const automationsHref = `/practice/${dietitianAccountId}/automations`;
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<AutomationRun[]>(`/api/v1/dietitian/${dietitianAccountId}/automation-runs`)
      .then(setRuns)
      .catch((err: unknown) => setError(errorMessage(err, "Unable to load runs")))
      .finally(() => setLoading(false));
  }, [dietitianAccountId]);

  const failedCount = runs.filter((r) => r.status === "FAILED" || r.status === "ERROR").length;
  const successCount = runs.filter((r) => r.status === "COMPLETED" || r.status === "SUCCESS" || r.status === "SUCCEEDED").length;

  const backButton = (
    <Link href={automationsHref} className="ui-btn ui-btn--secondary">
      Back
    </Link>
  );

  if (loading) {
    return (
      <section className="ui-automations">
        <PageHeader title="Run history" description="Every time a rule ran — most recent first." actions={backButton} />
        <LoadingState>Loading run history…</LoadingState>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ui-automations">
        <PageHeader title="Run history" description="Every time a rule ran — most recent first." actions={backButton} />
        <ErrorState title="Unable to load runs">{error}</ErrorState>
      </section>
    );
  }

  return (
    <section className="ui-automations">
      <PageHeader
        title="Run history"
        description="Every time a rule ran — most recent first."
        actions={backButton}
      />

      {runs.length > 0 ? (
        <div className="ui-automations__chips">
          <span className="ui-automations__chip">{runs.length} runs</span>
          <span className="ui-automations__chip">{successCount} succeeded</span>
          <span className={`ui-automations__chip${failedCount > 0 ? " is-warn" : ""}`}>{failedCount} failed</span>
        </div>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState title="No runs recorded">Runs appear here after a rule triggers for the first time.</EmptyState>
      ) : (
        <div className="ui-automation-card ui-automation-runs">
          <Table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Status</th>
                <th>Trigger</th>
                <th>Action</th>
                <th>Started</th>
                <th>Failure reason</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <Td label="Rule">
                    <Link href={`${automationsHref}/${run.automationRuleId}`} className="ui-link">
                      {run.ruleName}
                    </Link>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={run.status} label={humanizeLabel(run.status)} />
                  </Td>
                  <Td label="Trigger">
                    <span className="ui-muted ui-automation-runs__cell">{automationTriggerLabel(run.triggerType)}</span>
                  </Td>
                  <Td label="Action">
                    <span className="ui-muted ui-automation-runs__cell">{automationActionLabel(run.actionType)}</span>
                  </Td>
                  <Td label="Started">
                    {run.startedAt ? (
                      <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </Td>
                  <Td label="Failure reason">
                    {run.errorMessage ? (
                      <span className="ui-automation-runs__error">{run.errorMessage}</span>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </section>
  );
}
