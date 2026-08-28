"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  Checkbox,
  ConfirmDialog,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@nutrition-saas/ui";
import {
  questionTypeLabel,
  type AssessmentQuestionView,
  type AssessmentSchemaView,
} from "../../../../../components/assessment-form";
import { api } from "../../../../../lib/api";
import { countActiveQuestions, type EvaluationTemplate } from "../../../../../lib/evaluation";
import { errorMessage } from "../../../../../lib/humanize-error";
import { usePractice } from "../../practice-shell";

type QuestionDraft = {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options: Array<{ id: string; label: string }>;
};

function emptyDraft(): QuestionDraft {
  return {
    id: `q-${crypto.randomUUID().slice(0, 8)}`,
    type: "TEXT",
    label: "",
    required: false,
    options: [],
  };
}

function fromQuestion(q: AssessmentQuestionView): QuestionDraft {
  return {
    id: q.id,
    type: q.type,
    label: q.label,
    required: Boolean(q.required),
    options: q.options ?? [],
  };
}

function needsChoices(type: string) {
  return type === "SINGLE_CHOICE" || type === "MULTI_CHOICE";
}

function MoveArrow({ dir }: { dir: "up" | "down" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      {dir === "up" ? (
        <path d="M6 14l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 10l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function QuestionComposer({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
  inputId,
  compact,
}: {
  draft: QuestionDraft;
  onChange: (next: QuestionDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  inputId?: string;
  compact?: boolean;
}) {
  const choices = needsChoices(draft.type);

  return (
    <form
      className={`ui-eval-composer${compact ? " ui-eval-composer--bare" : ""}`}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {error ? <p className="ui-eval-composer__error">{error}</p> : null}
      <Input
        id={inputId}
        className="ui-eval-composer__q"
        value={draft.label}
        onChange={(e) => onChange({ ...draft, label: e.target.value })}
        placeholder={compact ? "Question" : "New question"}
        aria-label="Question"
      />
      <Select
        className="ui-eval-composer__type"
        value={draft.type}
        aria-label="Answer type"
        onChange={(e) => onChange({ ...draft, type: e.target.value })}
      >
        <option value="TEXT">Short answer</option>
        <option value="TEXTAREA">Long answer</option>
        <option value="NUMBER">Number</option>
        <option value="BOOLEAN">Yes / No</option>
        <option value="SINGLE_CHOICE">Single choice</option>
        <option value="MULTI_CHOICE">Multiple choice</option>
      </Select>
      <Checkbox
        checked={draft.required}
        onChange={(e) => onChange({ ...draft, required: e.target.checked })}
        label="Required"
      />
      <Button type="submit" size="sm" disabled={pending || !draft.label.trim()}>
        {pending ? "Saving…" : submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      {choices ? (
        <Input
          className="ui-eval-composer__choices"
          value={draft.options.map((o) => o.label).join(", ")}
          onChange={(e) => {
            const labels = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({
              ...draft,
              options: labels.map((label, i) => ({
                id: draft.options[i]?.id ?? `opt-${i + 1}`,
                label,
              })),
            });
          }}
          placeholder="Choices, comma-separated"
          aria-label="Choices"
        />
      ) : null}
    </form>
  );
}

export default function EvaluationFormEditorPage() {
  const { dietitianAccountId } = usePractice();
  const params = useParams<{ templateId: string }>();
  const searchParams = useSearchParams();
  const templateId = params.templateId;
  const fromClient = searchParams.get("fromClient");
  const fromClientQs = fromClient ? `?fromClient=${encodeURIComponent(fromClient)}` : "";
  const listHref = `/practice/${dietitianAccountId}/evaluation${fromClientQs}`;
  const previewHref = `/practice/${dietitianAccountId}/evaluation/${templateId}/preview${fromClientQs}`;
  const clientEvalsHref = fromClient
    ? `/practice/${dietitianAccountId}/clients/${fromClient}?tab=assessments`
    : null;
  const apiBase = `/api/v1/dietitian/${dietitianAccountId}`;
  const addInputId = "eval-add-question";

  const [template, setTemplate] = useState<EvaluationTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addDraft, setAddDraft] = useState<QuestionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<QuestionDraft>(emptyDraft);
  const [pendingRemove, setPendingRemove] = useState<AssessmentQuestionView | null>(null);

  async function load() {
    const row = await api<EvaluationTemplate>(`${apiBase}/assessment-templates/${templateId}`);
    setTemplate(row);
    setName(row.name);
    setDescription(row.description ?? "");
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load form")));
  }, [dietitianAccountId, templateId]);

  const emptySchema: AssessmentSchemaView = { sections: [{ id: "main", questions: [] }] };
  const schema = template?.schema ?? emptySchema;
  const allQuestions = schema.sections.flatMap((s) => s.questions);
  const questions = allQuestions.filter((q) => q.active !== false);

  const detailsDirty =
    Boolean(template) &&
    (name.trim() !== template.name || (description.trim() || "") !== (template.description ?? ""));

  function startEdit(question: AssessmentQuestionView) {
    setEditingId(question.id);
    setEditDraft(fromQuestion(question));
    setEditError(null);
    setAddError(null);
  }

  function cancelEdit() {
    if (busy) return;
    setEditingId(null);
    setEditError(null);
  }

  function revertDetails() {
    if (!template) return;
    setName(template.name);
    setDescription(template.description ?? "");
  }

  async function saveMeta() {
    if (!detailsDirty) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<EvaluationTemplate>(`${apiBase}/assessment-templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
        }),
      });
      setTemplate(updated);
      setName(updated.name);
      setDescription(updated.description ?? "");
    } catch (err) {
      setError(errorMessage(err, "Unable to save form"));
    } finally {
      setBusy(false);
    }
  }

  function validateDraft(draft: QuestionDraft): string | null {
    if (!draft.label.trim()) return "Enter a question.";
    if (needsChoices(draft.type) && draft.options.filter((o) => o.label.trim()).length < 2) {
      return "Add at least two choices.";
    }
    return null;
  }

  async function upsertQuestion(draft: QuestionDraft, mode: "create" | "edit") {
    const message = validateDraft(draft);
    if (message) {
      if (mode === "create") setAddError(message);
      else setEditError(message);
      return;
    }
    setBusy(true);
    setError(null);
    setAddError(null);
    setEditError(null);
    try {
      await api(`${apiBase}/assessment-templates/${templateId}/questions`, {
        method: "POST",
        body: JSON.stringify({
          sectionId: "main",
          id: draft.id,
          type: draft.type,
          label: draft.label.trim(),
          required: draft.required,
          active: true,
          options: draft.options,
        }),
      });
      if (mode === "create") {
        setAddDraft(emptyDraft());
        window.requestAnimationFrame(() => document.getElementById(addInputId)?.focus());
      } else {
        setEditingId(null);
      }
      await load();
    } catch (err) {
      const text = errorMessage(err, mode === "create" ? "Unable to add question" : "Unable to save question");
      if (mode === "create") setAddError(text);
      else setEditError(text);
    } finally {
      setBusy(false);
    }
  }

  function reorder(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const activeIds = questions.map((q) => q.id);
    const swapped = [...activeIds];
    const tmp = swapped[nextIndex]!;
    swapped[nextIndex] = swapped[index]!;
    swapped[index] = tmp;
    const inactiveIds = allQuestions.filter((q) => q.active === false).map((q) => q.id);
    setBusy(true);
    setError(null);
    void api(`${apiBase}/assessment-templates/${templateId}/questions/reorder`, {
      method: "POST",
      body: JSON.stringify({ sectionId: "main", orderedIds: [...swapped, ...inactiveIds] }),
    })
      .then(() => load())
      .catch((err) => setError(errorMessage(err, "Unable to reorder")))
      .finally(() => setBusy(false));
  }

  async function removeQuestion() {
    if (!pendingRemove) return;
    setBusy(true);
    setError(null);
    try {
      await api(
        `${apiBase}/assessment-templates/${templateId}/questions/${encodeURIComponent(pendingRemove.id)}/deactivate`,
        { method: "POST" },
      );
      if (editingId === pendingRemove.id) setEditingId(null);
      setPendingRemove(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to remove question"));
      setPendingRemove(null);
    } finally {
      setBusy(false);
    }
  }

  if (!template) {
    return error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading form…</LoadingState>;
  }

  const questionCount = countActiveQuestions(template.schema);

  return (
    <section className="ui-list-page">
      <Breadcrumbs
        items={[
          { label: "Form library", href: listHref },
          { label: template.name },
        ]}
      />
      <PageHeader
        title={template.name}
        description={questionCount === 1 ? "1 question" : `${questionCount} questions`}
        actions={
          <div className="ui-row" style={{ gap: 10 }}>
            {clientEvalsHref ? (
              <Link href={clientEvalsHref} className="ui-btn ui-btn--secondary">
                Back to client
              </Link>
            ) : null}
            <Link href={previewHref} className="ui-btn ui-btn--secondary">
              Preview
            </Link>
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-eval-editor__meta">
        <label>
          <span>Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Form name" />
        </label>
        <label>
          <span>Description</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            aria-label="Form description"
          />
        </label>
        {detailsDirty ? (
          <div className="ui-eval-editor__meta-actions">
            <button type="button" className="ui-list-cards__action" disabled={busy} onClick={revertDetails}>
              Cancel
            </button>
            <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={() => void saveMeta()}>
              Save
            </Button>
          </div>
        ) : null}
      </div>

      <div className="ui-list-results">
        <QuestionComposer
          draft={addDraft}
          onChange={(next) => {
            setAddDraft(next);
            if (addError) setAddError(null);
          }}
          onSubmit={() => void upsertQuestion(addDraft, "create")}
          submitLabel="Add"
          pending={busy}
          error={addError}
          inputId={addInputId}
        />
        {questions.length === 0 ? (
          <p className="ui-eval-editor__empty">No questions yet. Add one above.</p>
        ) : (
          <ul className="ui-list-cards">
            {questions.map((q, index) => {
              const meta = [questionTypeLabel(q.type), q.required ? "Required" : null]
                .filter(Boolean)
                .join(" · ");
              const editing = editingId === q.id;
              return (
                <li key={q.id}>
                  <article className={`ui-list-cards__item${editing ? " is-editing" : ""}`}>
                    {editing ? (
                      <QuestionComposer
                        draft={editDraft}
                        onChange={setEditDraft}
                        onSubmit={() => void upsertQuestion(editDraft, "edit")}
                        onCancel={cancelEdit}
                        submitLabel="Save"
                        pending={busy}
                        error={editError}
                        compact
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ui-list-cards__main"
                          aria-label={`Edit question: ${q.label}`}
                          onClick={() => startEdit(q)}
                        >
                          <strong>
                            {index + 1}. {q.label}
                          </strong>
                          <p>{meta}</p>
                        </button>
                        <div className="ui-list-cards__aside">
                          <div className="ui-list-cards__actions">
                            <button
                              type="button"
                              className="ui-list-cards__action ui-list-cards__action--icon"
                              disabled={busy || index === 0}
                              aria-label="Move up"
                              onClick={() => reorder(index, -1)}
                            >
                              <MoveArrow dir="up" />
                            </button>
                            <button
                              type="button"
                              className="ui-list-cards__action ui-list-cards__action--icon"
                              disabled={busy || index >= questions.length - 1}
                              aria-label="Move down"
                              onClick={() => reorder(index, 1)}
                            >
                              <MoveArrow dir="down" />
                            </button>
                            <button
                              type="button"
                              className="ui-list-cards__action"
                              disabled={busy}
                              onClick={() => startEdit(q)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ui-list-cards__action is-danger"
                              disabled={busy}
                              onClick={() => setPendingRemove(q)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove this question?"
        description={
          pendingRemove
            ? `“${pendingRemove.label}” will no longer appear on new assignments. Existing client responses are kept.`
            : undefined
        }
        confirmLabel="Remove question"
        danger
        pending={busy}
        onConfirm={() => void removeQuestion()}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}
