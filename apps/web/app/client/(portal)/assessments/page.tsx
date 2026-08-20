"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, EmptyState, PageHeader, Section, Skeleton, StatusBadge, humanizeLabel } from "@nutrition-saas/ui";
import { AssessmentForm, type AssessmentSchemaView } from "../../../../components/assessment-form";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { formatDate } from "../../../../lib/format";

type AssessmentRow = {
  id: string;
  status: string;
  templateName: string;
  templateVersion: number;
  createdAt: string;
  completedAt: string | null;
};

type AssessmentDetail = AssessmentRow & {
  responses: Record<string, unknown> | null;
  schema: AssessmentSchemaView;
};

export default function PortalAssessmentsPage() {
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [selected, setSelected] = useState<AssessmentDetail | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<AssessmentRow[]>("/api/v1/portal/assessments");
      setRows(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load assessments"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    function onSwitch() {
      setSelected(null);
      void load();
    }
    window.addEventListener("portal-connection-changed", onSwitch);
    return () => window.removeEventListener("portal-connection-changed", onSwitch);
  }, [load]);

  async function open(id: string) {
    const row = await api<AssessmentDetail>(`/api/v1/portal/assessments/${id}`);
    setSelected(row);
    setResponses((row.responses as Record<string, unknown>) ?? {});
  }

  const openRows = rows.filter((r) => r.status === "IN_PROGRESS" || r.status === "DRAFT");
  const doneRows = rows.filter((r) => r.status === "COMPLETED");

  return (
    <section>
      <PageHeader
        eyebrow="Assessments"
        title="Your assessments"
        description="Complete surveys assigned by your dietitian for the active practice connection."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? <Skeleton style={{ height: 120, borderRadius: 12 }} /> : null}

      {!loading && openRows.length === 0 && doneRows.length === 0 ? (
        <EmptyState title="No assessments yet">
          When your dietitian starts an assessment for you, it will appear here.
        </EmptyState>
      ) : null}

      {openRows.length > 0 ? (
        <Section title="To complete">
          <ul className="ui-client-chart__list">
            {openRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="ui-link"
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontWeight: 500 }}
                  onClick={() => void open(row.id).catch((err) => setError(errorMessage(err)))}
                >
                  {row.templateName}
                </button>
                <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {doneRows.length > 0 ? (
        <Section title="Completed">
          <ul className="ui-client-chart__list">
            {doneRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="ui-link"
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontWeight: 500 }}
                  onClick={() => void open(row.id).catch((err) => setError(errorMessage(err)))}
                >
                  {row.templateName}
                  <span className="ui-muted">
                    {" "}
                    · {row.completedAt ? formatDate(row.completedAt) : formatDate(row.createdAt)}
                  </span>
                </button>
                <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {selected ? (
        <Section
          title={`${selected.templateName} · ${humanizeLabel(selected.status)}`}
          actions={
            <button type="button" className="ui-link" onClick={() => setSelected(null)}>
              Close
            </button>
          }
        >
          <AssessmentForm
            schema={selected.schema}
            responses={responses}
            onChange={setResponses}
            readOnly={selected.status === "COMPLETED" || selected.status === "ARCHIVED"}
            showInactive={selected.status === "COMPLETED"}
            saving={saving}
            onSave={
              selected.status === "COMPLETED"
                ? undefined
                : () => {
                    setSaving(true);
                    void api<AssessmentDetail>(`/api/v1/portal/assessments/${selected.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ responses }),
                    })
                      .then((row) => {
                        setSelected(row);
                        setResponses((row.responses as Record<string, unknown>) ?? {});
                      })
                      .catch((err: unknown) => setError(errorMessage(err, "Unable to save")))
                      .finally(() => setSaving(false));
                  }
            }
            onComplete={
              selected.status === "COMPLETED"
                ? undefined
                : () => {
                    setSaving(true);
                    void api<AssessmentDetail>(`/api/v1/portal/assessments/${selected.id}/complete`, {
                      method: "POST",
                      body: JSON.stringify({ responses }),
                    })
                      .then((row) => {
                        setSelected(row);
                        setResponses((row.responses as Record<string, unknown>) ?? {});
                        return load();
                      })
                      .catch((err: unknown) => setError(errorMessage(err, "Unable to submit")))
                      .finally(() => setSaving(false));
                  }
            }
          />
        </Section>
      ) : null}
    </section>
  );
}
