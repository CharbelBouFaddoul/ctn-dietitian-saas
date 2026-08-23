"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, Breadcrumbs, Button, ConfirmDialog, PageHeader, StatusBadge } from "@nutrition-saas/ui";
import { AssessmentForm } from "../../../../../../../components/assessment-form";
import { api } from "../../../../../../../lib/api";
import {
  evaluationStatusLabel,
  type EvaluationAssessmentDetail,
} from "../../../../../../../lib/evaluation";
import { formatDate } from "../../../../../../../lib/format";
import { errorMessage } from "../../../../../../../lib/humanize-error";
import { canManageClients } from "../../../../../../../lib/practice-access";
import { usePractice } from "../../../../practice-shell";

export default function ClientEvaluationDetailPage() {
  const router = useRouter();
  const { dietitianAccountId, role } = usePractice();
  const params = useParams<{ clientId: string; assessmentId: string }>();
  const clientId = params.clientId;
  const assessmentId = params.assessmentId;
  const allowManage = canManageClients(role);
  const chartHref = `/practice/${dietitianAccountId}/clients/${clientId}?tab=assessments`;
  const apiBase = `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/assessments/${assessmentId}`;

  const [selected, setSelected] = useState<EvaluationAssessmentDetail | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clientName, setClientName] = useState("Client");

  useEffect(() => {
    void Promise.all([
      api<EvaluationAssessmentDetail>(apiBase),
      api<{ client: { firstName: string; lastName: string; displayName: string | null } }>(
        `/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/portfolio`,
      ).catch(() => null),
    ])
      .then(([row, portfolio]) => {
        setSelected(row);
        setResponses((row.responses as Record<string, unknown>) ?? {});
        if (portfolio?.client) {
          const c = portfolio.client;
          setClientName(c.displayName?.trim() || `${c.firstName} ${c.lastName}`);
        }
      })
      .catch((err) => setError(errorMessage(err, "Unable to load evaluation")));
  }, [apiBase, dietitianAccountId, clientId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!selected) return <p className="ui-muted">Loading evaluation…</p>;

  const readOnly = selected.status === "COMPLETED" || selected.status === "ARCHIVED" || !allowManage;

  return (
    <section className="ui-eval">
      <Breadcrumbs
        items={[
          { label: "Clients", href: `/practice/${dietitianAccountId}/clients` },
          { label: clientName, href: chartHref },
          { label: selected.templateName },
        ]}
      />
      <PageHeader
        eyebrow="Client evaluation"
        title={selected.templateName}
        description={
          selected.status === "COMPLETED"
            ? `Submitted${selected.completedAt ? ` · ${formatDate(selected.completedAt)}` : ""}`
            : `Status: ${evaluationStatusLabel(selected.status)} · Created ${formatDate(selected.createdAt)}`
        }
        actions={
          <div className="ui-eval__header-actions">
            <StatusBadge status={selected.status} label={evaluationStatusLabel(selected.status)} />
            {allowManage ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            <Link href={chartHref} className="ui-btn ui-btn--secondary ui-btn--sm">
              Back to evaluations
            </Link>
          </div>
        }
      />

      <div className="ui-eval__preview-shell">
        <AssessmentForm
          schema={selected.schema}
          responses={responses}
          onChange={setResponses}
          readOnly={readOnly}
          showInactive={selected.status === "COMPLETED"}
          saving={saving}
          completedAt={selected.completedAt}
          submittedBanner={selected.status === "COMPLETED"}
          onSave={
            readOnly
              ? undefined
              : async () => {
                  setSaving(true);
                  try {
                    const row = await api<EvaluationAssessmentDetail>(apiBase, {
                      method: "PATCH",
                      body: JSON.stringify({ responses }),
                    });
                    setSelected(row);
                    setResponses((row.responses as Record<string, unknown>) ?? {});
                  } catch (err) {
                    setError(errorMessage(err, "Unable to save"));
                  } finally {
                    setSaving(false);
                  }
                }
          }
          onComplete={
            readOnly
              ? undefined
              : async () => {
                  setSaving(true);
                  try {
                    const row = await api<EvaluationAssessmentDetail>(`${apiBase}/complete`, {
                      method: "POST",
                      body: JSON.stringify({ responses }),
                    });
                    setSelected(row);
                    setResponses((row.responses as Record<string, unknown>) ?? {});
                  } catch (err) {
                    setError(errorMessage(err, "Unable to submit"));
                  } finally {
                    setSaving(false);
                  }
                }
          }
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this evaluation?"
        description="It will be removed from this client chart and from the patient’s portal. This cannot be undone."
        confirmLabel="Delete evaluation"
        pending={deleting}
        onCancel={() => {
          if (deleting) return;
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          setDeleting(true);
          void api(`${apiBase}/archive`, { method: "POST" })
            .then(() => {
              router.push(chartHref);
            })
            .catch((err) => {
              setError(errorMessage(err, "Unable to delete evaluation"));
              setConfirmDelete(false);
            })
            .finally(() => setDeleting(false));
        }}
      />
    </section>
  );
}
