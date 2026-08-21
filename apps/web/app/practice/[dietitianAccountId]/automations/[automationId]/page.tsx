"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Breadcrumbs,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
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

  if (loading) {
    return <LoadingState>Loading automation…</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState title="Unable to load automation">
        {error}
      </ErrorState>
    );
  }

  if (!rule) {
    return <ErrorState title="Automation not found" />;
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
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/automations`, label: "Automations" },
          { label: rule.name },
        ]}
      />

      <PageHeader
        title={rule.name}
        description={`When ${automationTriggerLabel(rule.triggerType).toLowerCase()} → ${automationActionLabel(rule.actionType).toLowerCase()}`}
        actions={<StatusBadge status={rule.status} label={humanizeLabel(rule.status)} />}
      />

      <Section title="Rule details" tone="mint">
        <dl className="ui-automations__detail-grid">
          <dt>When</dt>
          <dd>{automationTriggerLabel(rule.triggerType)}</dd>
          <dt>Then</dt>
          <dd>{automationActionLabel(rule.actionType)}</dd>
          {showWho ? (
            <>
              <dt>Who</dt>
              <dd>{automationRecipientLabel(recipient)}</dd>
            </>
          ) : null}
          <dt>Apply to</dt>
          <dd>{scopeText}</dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={rule.status} label={humanizeLabel(rule.status)} />
          </dd>
        </dl>
      </Section>

      <Section
        title="Recent runs"
        description={
          runs.length
            ? `${runs.length} run${runs.length !== 1 ? "s" : ""} · ${successCount} succeeded · ${failCount} failed`
            : undefined
        }
      >
        {runs.length === 0 ? (
          <EmptyState title="No runs recorded">
            This rule has not triggered yet. Runs appear here after the first execution.
          </EmptyState>
        ) : (
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
                      <span style={{ color: "var(--color-warning)" }}>{run.retryCount}</span>
                    ) : (
                      run.retryCount
                    )}
                  </Td>
                  <Td label="Failure reason">
                    {run.errorMessage ? (
                      <span className="ui-muted">{run.errorMessage}</span>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </section>
  );
}
