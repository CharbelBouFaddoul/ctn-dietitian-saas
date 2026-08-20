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
import { errorMessage } from "../../../../../lib/humanize-error";

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

const TRIGGERS: Record<string, string> = {
  APPOINTMENT_UPCOMING: "Appointment is approaching",
  CLIENT_INACTIVE: "Client has no recent activity",
  INVOICE_OVERDUE: "Invoice is overdue",
  TASK_DUE: "Task is due today",
  MEAL_PLAN_ENDING: "Meal plan is ending soon",
  CLIENT_CHECKIN_DUE: "Client check-in is due",
};

const ACTIONS: Record<string, string> = {
  SEND_IN_APP_NOTIFICATION: "Send in-app notification",
  SEND_EMAIL: "Send email",
  CREATE_TASK: "Create follow-up task",
  CREATE_CLIENT_NOTIFICATION: "Notify client (portal)",
};

function triggerLabel(value: string): string {
  return TRIGGERS[value] ?? humanizeLabel(value);
}

function actionLabel(value: string): string {
  return ACTIONS[value] ?? humanizeLabel(value);
}

function runDuration(run: AutomationRun): string {
  if (!run.startedAt || !run.completedAt) return "—";
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AutomationDetailPage() {
  const params = useParams<{ organizationId: string; automationId: string }>();
  const { organizationId, automationId } = params;
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api<AutomationRule>(`/api/v1/organizations/${organizationId}/automations/${automationId}`),
      api<AutomationRun[]>(`/api/v1/organizations/${organizationId}/automations/${automationId}/runs`),
    ])
      .then(([ruleData, runData]) => {
        setRule(ruleData);
        setRuns(runData);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load automation")))
      .finally(() => setLoading(false));
  }, [organizationId, automationId]);

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

  const successCount = runs.filter((r) => r.status === "COMPLETED" || r.status === "SUCCESS").length;
  const failCount = runs.filter((r) => r.status === "FAILED" || r.status === "ERROR").length;

  return (
    <section>
      <Breadcrumbs
        items={[
          { href: `/practice/${organizationId}/automations`, label: "Automations" },
          { label: rule.name },
        ]}
      />

      <PageHeader
        title={rule.name}
        description={`When ${triggerLabel(rule.triggerType).toLowerCase()} → ${actionLabel(rule.actionType).toLowerCase()}`}
        actions={<StatusBadge status={rule.status} label={humanizeLabel(rule.status)} />}
      />

      <Section title="Rule details" tone="muted">
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 24px", margin: 0 }}>
          <dt className="ui-muted" style={{ fontSize: "0.875rem" }}>WHEN</dt>
          <dd style={{ margin: 0, fontWeight: 500 }}>{triggerLabel(rule.triggerType)}</dd>
          <dt className="ui-muted" style={{ fontSize: "0.875rem" }}>THEN</dt>
          <dd style={{ margin: 0, fontWeight: 500 }}>{actionLabel(rule.actionType)}</dd>
          <dt className="ui-muted" style={{ fontSize: "0.875rem" }}>Status</dt>
          <dd style={{ margin: 0 }}>
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
