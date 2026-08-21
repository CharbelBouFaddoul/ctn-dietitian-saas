"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  Field,
  Section,
  Select,
  StatusBadge,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import {
  countActiveQuestions,
  evaluationStatusLabel,
  type EvaluationAssessment,
  type EvaluationTemplate,
} from "../lib/evaluation";
import { formatDate } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";

type Props = {
  dietitianAccountId: string;
  clientId: string;
  base: string;
  orgBase: string;
  allowManage: boolean;
  onError: (message: string) => void;
  onPortfolioRefresh: () => Promise<void>;
  /** When true, omit the Form library toolbar link (parent page already exposes it). */
  hideLibraryLink?: boolean;
};

export function ClientAssessmentsPanel({
  dietitianAccountId,
  clientId,
  base,
  orgBase,
  allowManage,
  onError,
  onPortfolioRefresh,
  hideLibraryLink = false,
}: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [assessments, setAssessments] = useState<EvaluationAssessment[]>([]);
  const [busy, setBusy] = useState(false);
  const formsHref = `/practice/${dietitianAccountId}/evaluation?fromClient=${encodeURIComponent(clientId)}`;
  const detailBase = `/practice/${dietitianAccountId}/clients/${clientId}/evaluations`;

  async function load() {
    const [templateRows, assessmentRows] = await Promise.all([
      api<EvaluationTemplate[]>(`${orgBase}/assessment-templates`),
      api<EvaluationAssessment[]>(`${base}/assessments`),
    ]);
    setTemplates(templateRows);
    setAssessments(assessmentRows);
    if (!templateId && templateRows[0]) setTemplateId(templateRows[0].id);
  }

  useEffect(() => {
    void load().catch((err) => onError(errorMessage(err, "Unable to load evaluations")));
  }, [base, orgBase]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const questionCount = countActiveQuestions(selectedTemplate?.schema);
  const openRows = assessments.filter((r) => r.status === "IN_PROGRESS" || r.status === "DRAFT");
  const doneRows = assessments.filter((r) => r.status === "COMPLETED" || r.status === "ARCHIVED");

  const templateOptions = useMemo(
    () => templates.filter((t) => !t.status || t.status === "ACTIVE"),
    [templates],
  );

  return (
    <div className="ui-eval ui-eval--client">
      <div className="ui-eval__client-toolbar">
        <div>
          <h2 className="ui-eval__client-title">Evaluations for this client</h2>
          <p className="ui-muted" style={{ margin: "0.25rem 0 0" }}>
            Assign a form to this patient, then review their submissions here.
          </p>
        </div>
        {hideLibraryLink ? null : (
          <Link href={formsHref} className="ui-btn ui-btn--secondary ui-btn--sm">
            Form library
          </Link>
        )}
      </div>

      <Section title="Assign evaluation" description="Choose a form from your library and send it to this client.">
        <div className="ui-eval__start">
          <div className="ui-eval__start-field">
            <Field label="Form">
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templateOptions.length === 0 ? <option value="">No active forms</option> : null}
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="ui-eval__start-actions">
            <span className="ui-eval__start-meta">
              {templateId ? `${questionCount} question${questionCount === 1 ? "" : "s"}` : "Select a form"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!templateId || !allowManage || busy}
              onClick={() => {
                setBusy(true);
                void api<{ id: string }>(`${base}/assessments`, {
                  method: "POST",
                  body: JSON.stringify({ templateId }),
                })
                  .then(async (row) => {
                    await Promise.all([load(), onPortfolioRefresh()]);
                    router.push(`${detailBase}/${row.id}`);
                  })
                  .catch((err) => onError(errorMessage(err, "Unable to assign evaluation")))
                  .finally(() => setBusy(false));
              }}
            >
              Assign to client
            </Button>
          </div>
        </div>
      </Section>

      <div className="ui-eval__split">
        <Section title="In progress">
          {openRows.length === 0 ? (
            <EmptyState title="Nothing in progress">Assign a form above to begin.</EmptyState>
          ) : (
            <div className="ui-eval__list-cards">
              {openRows.map((row) => (
                <Link key={row.id} href={`${detailBase}/${row.id}`} className="ui-eval__list-card">
                  <div>
                    <strong>{row.templateName}</strong>
                    <p className="ui-eval__card-meta">Started {formatDate(row.startedAt ?? row.createdAt)}</p>
                  </div>
                  <StatusBadge status={row.status} label={evaluationStatusLabel(row.status)} />
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Submitted">
          {doneRows.length === 0 ? (
            <EmptyState title="No submissions yet" />
          ) : (
            <div className="ui-eval__list-cards">
              {doneRows.map((row) => (
                <Link key={row.id} href={`${detailBase}/${row.id}`} className="ui-eval__list-card">
                  <div>
                    <strong>{row.templateName}</strong>
                    <p className="ui-eval__card-meta">
                      {row.completedAt ? `Submitted ${formatDate(row.completedAt)}` : formatDate(row.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} label={evaluationStatusLabel(row.status)} />
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
