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
import { api } from "../../../../../lib/api";
import {
  automationActionLabel,
  automationRecipientLabel,
  automationTriggerLabel,
} from "../../../../../lib/automation-labels";
import { errorMessage } from "../../../../../lib/humanize-error";

interface AutomationRule {
  id: string;
  name: string;
  status: string;
  summary: string;
  triggerType: string;
  actionType: string;
  configuration: { recipient?: string } | unknown;
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

function runDuration(run: AutomationRun): string {
  if (!run.startedAt || !run.completedAt) return "—";
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function configRecipient(configuration: AutomationRule["configuration"]): string | null {
  if (configuration && typeof configuration === "object" && "recipient" in configuration) {
    const value = (configuration as { recipient?: string }).recipient;
    return value ?? null;
  }
  return null;
}

export default function AutomationDetailPage() {
  const params = useParams<{ dietitianAccountId: string; automationId: string }>();
  const { dietitianAccountId, automationId } = params;
  const automationsHref = `/practice/${dietitianAccountId}/automations`;
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api<AutomationRule>(`/api/v1/dietitian/${dietitianAccountId}/automations/${automationId}`),
      api<AutomationRun[]>(`/api/v1/dietitian/${dietitianAccountId}/automations/${automationId}/runs`),
    ])
      .then(([ruleData, runData]) => {
        setRule(ruleData);
        setRuns(runData);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load automation")))
      .finally(() => setLoading(false));
  }, [dietitianAccountId, automationId]);

  const backButton = (
    <Link href={automationsHref} className="ui-btn ui-btn--secondary">
      Back
    </Link>
  );

  if (loading) {
    return (
      <section className="ui-automations">
        <PageHeader title="Rule runs" description="History for this automation." actions={backButton} />
        <LoadingState>Loading runs…</LoadingState>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ui-automations">
        <PageHeader title="Rule runs" description="History for this automation." actions={backButton} />
        <ErrorState title="Unable to load automation">{error}</ErrorState>
      </section>
    );
  }

  if (!rule) {
    return (
      <section className="ui-automations">
        <PageHeader title="Rule runs" description="History for this automation." actions={backButton} />
        <ErrorState title="Automation not found" />
      </section>
    );
  }

  const successCount = runs.filter(
    (r) => r.status === "SUCCEEDED" || r.status === "COMPLETED" || r.status === "SUCCESS",
  ).length;
  const failCount = runs.filter((r) => r.status === "FAILED" || r.status === "ERROR").length;
  const recipient = configRecipient(rule.configuration);
  const showWho = rule.actionType !== "CREATE_TASK" && recipient;
  const config =
    rule.configuration && typeof rule.configuration === "object"
      ? (rule.configuration as { clientScope?: string; clientIds?: string[] })
      : {};
  const scopeText =
    config.clientScope === "SELECTED" && config.clientIds?.length
      ? `${config.clientIds.length} selected client${config.clientIds.length === 1 ? "" : "s"}`
      : "All clients";

  return (
    <section className="ui-automations">
      <PageHeader
        title={rule.name}
        description={`When ${automationTriggerLabel(rule.triggerType).toLowerCase()} → ${automationActionLabel(rule.actionType).toLowerCase()}`}
        actions={
          <div className="ui-row">
            {backButton}
            <Link href={`${automationsHref}?edit=${rule.id}`} className="ui-btn ui-btn--secondary">
              Edit
            </Link>
          </div>
        }
      />

      <div className="ui-automations__chips">
        <span className="ui-automations__chip">{humanizeLabel(rule.status)}</span>
        <span className="ui-automations__chip">{scopeText}</span>
        {showWho ? <span className="ui-automations__chip">{automationRecipientLabel(recipient)}</span> : null}
        <span className="ui-automations__chip">{runs.length} runs</span>
        <span className="ui-automations__chip">{successCount} succeeded</span>
        <span className={`ui-automations__chip${failCount > 0 ? " is-warn" : ""}`}>{failCount} failed</span>
      </div>

      {runs.length === 0 ? (
        <EmptyState title="No runs recorded">
          This rule has not triggered yet. Executions for this automation appear here.
        </EmptyState>
      ) : (
        <div className="ui-automation-card ui-automation-runs">
          <Table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Retries</th>
                <th>Failure reason</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <Td label="Status">
                    <StatusBadge status={run.status} label={humanizeLabel(run.status)} />
                  </Td>
                  <Td label="Started">
                    {run.startedAt ? (
                      <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </Td>
                  <Td label="Duration">{runDuration(run)}</Td>
                  <Td label="Retries">
                    {run.retryCount > 0 ? (
                      <span className="ui-automation-runs__error">{run.retryCount}</span>
                    ) : (
                      run.retryCount
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
