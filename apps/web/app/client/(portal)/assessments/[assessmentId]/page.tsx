"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, PageHeader, StatusBadge } from "@nutrition-saas/ui";
import { AssessmentForm } from "../../../../../components/assessment-form";
import { api } from "../../../../../lib/api";
import {
  evaluationStatusLabel,
  type EvaluationAssessmentDetail,
} from "../../../../../lib/evaluation";
import { formatDate } from "../../../../../lib/format";
import { errorMessage } from "../../../../../lib/humanize-error";

export default function PortalAssessmentDetailPage() {
  const params = useParams<{ assessmentId: string }>();
  const assessmentId = params.assessmentId;
  const [selected, setSelected] = useState<EvaluationAssessmentDetail | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<EvaluationAssessmentDetail>(`/api/v1/portal/assessments/${assessmentId}`)
      .then((row) => {
        setSelected(row);
        setResponses((row.responses as Record<string, unknown>) ?? {});
      })
      .catch((err) => setError(errorMessage(err, "Unable to load evaluation")));
  }, [assessmentId]);

  if (error) {
    return (
      <section>
        <Alert tone="danger">{error}</Alert>
        <Link href="/client/assessments" className="ui-btn ui-btn--secondary ui-btn--sm" style={{ marginTop: 12 }}>
          Back to assessments
        </Link>
      </section>
    );
  }
  if (!selected) return <p className="ui-muted">Loading evaluation…</p>;

  const readOnly = selected.status === "COMPLETED" || selected.status === "ARCHIVED";

  return (
    <section className="ui-eval ui-eval--portal">
      <PageHeader
        eyebrow="Patient evaluation"
        title={selected.templateName}
        description={
          readOnly
            ? `Submitted${selected.completedAt ? ` · ${formatDate(selected.completedAt)}` : ""}`
            : "Save anytime and come back later. Submit when you are finished."
        }
        actions={
          <div className="ui-eval__header-actions">
            <StatusBadge status={selected.status} label={evaluationStatusLabel(selected.status)} />
            <Link href="/client/assessments" className="ui-btn ui-btn--secondary ui-btn--sm">
              All assessments
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
          showInactive={readOnly}
          saving={saving}
          completedAt={selected.completedAt}
          submittedBanner={readOnly}
          onSave={
            readOnly
              ? undefined
              : async () => {
                  setSaving(true);
                  try {
                    const row = await api<EvaluationAssessmentDetail>(
                      `/api/v1/portal/assessments/${assessmentId}`,
                      { method: "PATCH", body: JSON.stringify({ responses }) },
                    );
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
                    const row = await api<EvaluationAssessmentDetail>(
                      `/api/v1/portal/assessments/${assessmentId}/complete`,
                      { method: "POST", body: JSON.stringify({ responses }) },
                    );
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
    </section>
  );
}
