"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, ConfirmDialog, EmptyState, Field, SearchInput, Select, StatusBadge } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import {
  assessmentProgress,
  countActiveQuestions,
  evaluationStatusLabel,
  type EvaluationAssessment,
  type EvaluationTemplate,
} from "../lib/evaluation";
import { formatDate } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";

const PAGE_SIZE = 5;

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

function matchesQuery(row: EvaluationAssessment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.templateName.toLowerCase().includes(q) ||
    evaluationStatusLabel(row.status).toLowerCase().includes(q)
  );
}

function FormListSection({
  title,
  rows,
  emptyTitle,
  emptyBody,
  searchPlaceholder,
  detailBase,
  allowManage,
  busy,
  deleting,
  mode,
  onDelete,
}: {
  title: string;
  rows: EvaluationAssessment[];
  emptyTitle: string;
  emptyBody?: string;
  searchPlaceholder: string;
  detailBase: string;
  allowManage: boolean;
  busy: boolean;
  deleting: boolean;
  mode: "progress" | "submitted";
  onDelete: (row: EvaluationAssessment) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => rows.filter((row) => matchesQuery(row, query)), [rows, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, rows.length]);

  return (
    <section className="ui-clinical-rail ui-eval__form-list">
      <header className="ui-clinical-rail__head">
        <h3>
          {title}
          {rows.length > 0 ? <span className="ui-eval__form-count">{rows.length}</span> : null}
        </h3>
      </header>

      {rows.length === 0 ? (
        <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>
      ) : (
        <>
          <div className="ui-eval__form-search">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder}
              aria-label={`Search ${title.toLowerCase()}`}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="ui-muted ui-eval__form-empty-filter">No forms match “{query.trim()}”.</p>
          ) : (
            <ul className="ui-eval__form-rows">
              {pageRows.map((row) => {
                const progress = assessmentProgress(row);
                const remaining = Math.max(0, progress.total - progress.answered);
                const href = `${detailBase}/${row.id}`;
                return (
                  <li key={row.id} className="ui-eval__form-row">
                    <div className="ui-eval__form-row-main">
                      <strong>{row.templateName}</strong>
                      {mode === "progress" ? (
                        <>
                          <span className="ui-eval__form-progress-line">
                            <span className="ui-eval__form-fraction">
                              {progress.answered}/{progress.total || "—"}
                            </span>
                            <span className="ui-muted">
                              {progress.total === 0
                                ? "No questions on this form"
                                : remaining === 0
                                  ? "All questions answered"
                                  : `${remaining} left · ${
                                      progress.requiredTotal > 0
                                        ? `${progress.requiredAnswered}/${progress.requiredTotal} required`
                                        : "optional answers"
                                    }`}
                            </span>
                          </span>
                          {progress.total > 0 ? (
                            <div className="ui-eval__form-bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.round((progress.answered / progress.total) * 100)}%`,
                                }}
                              />
                            </div>
                          ) : null}
                          <span className="ui-muted">
                            Started {formatDate(row.startedAt ?? row.createdAt)}
                          </span>
                        </>
                      ) : (
                        <span className="ui-muted">
                          {row.completedAt
                            ? `Submitted ${formatDate(row.completedAt)}`
                            : formatDate(row.createdAt)}
                          {progress.total > 0
                            ? ` · ${progress.total} question${progress.total === 1 ? "" : "s"}`
                            : null}
                        </span>
                      )}
                    </div>
                    <div className="ui-eval__form-row-actions">
                      <StatusBadge status={row.status} label={evaluationStatusLabel(row.status)} />
                      <Link href={href} className="ui-btn ui-btn--secondary ui-btn--sm">
                        Open
                      </Link>
                      {allowManage ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy || deleting}
                          onClick={() => onDelete(row)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > PAGE_SIZE ? (
            <div className="ui-eval__form-pager">
              <span className="ui-muted">
                Page {safePage} of {pageCount}
              </span>
              <div className="ui-eval__form-pager-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

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
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [assessments, setAssessments] = useState<EvaluationAssessment[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EvaluationAssessment | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const doneRows = assessments.filter((r) => r.status === "COMPLETED");

  const templateOptions = useMemo(
    () => templates.filter((t) => !t.status || t.status === "ACTIVE"),
    [templates],
  );

  return (
    <div className="ui-eval ui-eval--client">
      <div className="ui-clinical-savebar">
        <div>
          <h2 className="ui-eval__client-title">Custom forms</h2>
          <p className="ui-muted">Questionnaires you created — separate from the default clinical profile.</p>
        </div>
        <div className="ui-eval__header-actions">
          {hideLibraryLink ? null : (
            <Link href={formsHref} className="ui-btn ui-btn--secondary ui-btn--sm">
              Form library
            </Link>
          )}
        </div>
      </div>

      <section className="ui-clinical-card">
        <h2 className="ui-clinical-card__title">Assign a custom form</h2>
        <p className="ui-eval__card-lead">Choose a questionnaire from your library and send it to this client.</p>
        <div className="ui-eval__start">
          <Field label="Form">
            <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templateOptions.length === 0 ? <option value="">No active forms</option> : null}
              {templateOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="ui-eval__start-actions">
            <span className="ui-eval__start-meta">
              {templateId ? `${questionCount} question${questionCount === 1 ? "" : "s"}` : "Select a form"}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!templateId || !allowManage || busy}
              onClick={() => {
                setBusy(true);
                void api<{ id: string }>(`${base}/assessments`, {
                  method: "POST",
                  body: JSON.stringify({ templateId }),
                })
                  .then(async () => {
                    await Promise.all([load(), onPortfolioRefresh()]);
                  })
                  .catch((err) => onError(errorMessage(err, "Unable to assign evaluation")))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Assigning…" : "Assign to client"}
            </Button>
          </div>
        </div>
      </section>

      <div className="ui-eval__split">
        <FormListSection
          title="In progress"
          rows={openRows}
          emptyTitle="Nothing in progress"
          emptyBody="Assign a form above to begin."
          searchPlaceholder="Search in-progress forms…"
          detailBase={detailBase}
          allowManage={allowManage}
          busy={busy}
          deleting={deleting}
          mode="progress"
          onDelete={setPendingDelete}
        />
        <FormListSection
          title="Submitted"
          rows={doneRows}
          emptyTitle="No submissions yet"
          searchPlaceholder="Search submitted forms…"
          detailBase={detailBase}
          allowManage={allowManage}
          busy={busy}
          deleting={deleting}
          mode="submitted"
          onDelete={setPendingDelete}
        />
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this evaluation?"
        description="It will be removed from this client chart and from the patient’s portal. This cannot be undone."
        confirmLabel="Delete evaluation"
        pending={deleting}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (!pendingDelete) return;
          setDeleting(true);
          void api(`${base}/assessments/${pendingDelete.id}/archive`, { method: "POST" })
            .then(async () => {
              setPendingDelete(null);
              await Promise.all([load(), onPortfolioRefresh()]);
            })
            .catch((err) => onError(errorMessage(err, "Unable to delete evaluation")))
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}
