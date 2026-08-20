"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
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
import { api } from "../../../../lib/api";
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

const TRIGGERS: Record<string, string> = {
  APPOINTMENT_UPCOMING: "Appointment approaching",
  CLIENT_INACTIVE: "Client inactive",
  INVOICE_OVERDUE: "Invoice overdue",
  TASK_DUE: "Task due",
  MEAL_PLAN_ENDING: "Meal plan ending",
  CLIENT_CHECKIN_DUE: "Check-in due",
};

const ACTIONS: Record<string, string> = {
  SEND_IN_APP_NOTIFICATION: "In-app notification",
  SEND_EMAIL: "Email",
  CREATE_TASK: "Task created",
  CREATE_CLIENT_NOTIFICATION: "Client notified",
};

function triggerLabel(value: string): string {
  return TRIGGERS[value] ?? humanizeLabel(value);
}

function actionLabel(value: string): string {
  return ACTIONS[value] ?? humanizeLabel(value);
}

export default function AutomationRunsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<AutomationRun[]>(`/api/v1/organizations/${organizationId}/automation-runs`)
      .then(setRuns)
      .catch((err: unknown) => setError(errorMessage(err, "Unable to load runs")))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const failedCount = runs.filter((r) => r.status === "FAILED" || r.status === "ERROR").length;
  const successCount = runs.filter((r) => r.status === "COMPLETED" || r.status === "SUCCESS").length;

  if (loading) {
    return <LoadingState>Loading run history…</LoadingState>;
  }

  if (error) {
    return <ErrorState title="Unable to load runs">{error}</ErrorState>;
  }

  return (
    <section>
      <Breadcrumbs
        items={[
          { href: `/practice/${organizationId}/automations`, label: "Automations" },
          { label: "Run history" },
        ]}
      />

      <PageHeader
        title="Automation runs"
        description="A log of every automation execution — most recent first."
        actions={
          runs.length > 0 ? (
            <div className="ui-row">
              <Badge tone="success">{successCount} succeeded</Badge>
              <Badge tone={failedCount > 0 ? "danger" : "neutral"}>{failedCount} failed</Badge>
            </div>
          ) : undefined
        }
      />

      {runs.length === 0 ? (
        <EmptyState
          title="No runs recorded"
          action={
            <Link href={`/practice/${organizationId}/automations`} className="ui-btn ui-btn--secondary">
              Back to automations
            </Link>
          }
        >
          Runs appear here after an automation rule triggers for the first time.
        </EmptyState>
      ) : (
        <Section>
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
                    <Link
                      href={`/practice/${organizationId}/automations/${run.automationRuleId}`}
                      className="ui-link"
                    >
                      {run.ruleName}
                    </Link>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={run.status} label={humanizeLabel(run.status)} />
                  </Td>
                  <Td label="Trigger">
                    <span className="ui-muted" style={{ fontSize: "0.875rem" }}>
                      {triggerLabel(run.triggerType)}
                    </span>
                  </Td>
                  <Td label="Action">
                    <span className="ui-muted" style={{ fontSize: "0.875rem" }}>
                      {actionLabel(run.actionType)}
                    </span>
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
                      <span style={{ color: "var(--color-danger)", fontSize: "0.875rem" }}>
                        {run.errorMessage}
                      </span>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}
    </section>
  );
}
