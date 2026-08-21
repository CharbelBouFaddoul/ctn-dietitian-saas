"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox, ConfirmDialog, Field, Input, Select, Textarea } from "@nutrition-saas/ui";

export type AssessmentQuestionView = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  active?: boolean;
  options?: Array<{ id: string; label: string }>;
};

export type AssessmentSchemaView = {
  sections: Array<{
    id: string;
    title?: string;
    questions: AssessmentQuestionView[];
  }>;
};

type Props = {
  schema: AssessmentSchemaView;
  responses: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  /** Preview mode: interactive look-and-feel, no save/submit actions. */
  preview?: boolean;
  onSave?: () => void | Promise<void>;
  onComplete?: () => void | Promise<void>;
  saving?: boolean;
  showInactive?: boolean;
  completedAt?: string | null;
  submittedBanner?: boolean;
};

export function questionTypeLabel(type: string): string {
  switch (type.toUpperCase()) {
    case "TEXT":
      return "Short answer";
    case "TEXTAREA":
      return "Long answer";
    case "NUMBER":
      return "Number";
    case "BOOLEAN":
      return "Yes / No";
    case "SINGLE_CHOICE":
      return "Single choice";
    case "MULTI_CHOICE":
      return "Multiple choice";
    default:
      return type;
  }
}

export function AssessmentForm({
  schema,
  responses,
  onChange,
  readOnly = false,
  preview = false,
  onSave,
  onComplete,
  saving = false,
  showInactive = false,
  completedAt = null,
  submittedBanner = false,
}: Props) {
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  const sections = useMemo(
    () =>
      schema.sections
        .map((section) => ({
          ...section,
          questions: section.questions.filter((q) => showInactive || q.active !== false),
        }))
        .filter((section) => section.questions.length > 0),
    [schema, showInactive],
  );

  const questions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);

  const requiredQuestions = questions.filter((q) => q.required && q.active !== false);
  const requiredAnswered = requiredQuestions.filter((q) => !isEmpty(responses[q.id])).length;
  const answeredCount = questions.filter((q) => !isEmpty(responses[q.id])).length;
  const progressPct =
    requiredQuestions.length > 0
      ? Math.round((requiredAnswered / requiredQuestions.length) * 100)
      : questions.length > 0
        ? Math.round((answeredCount / questions.length) * 100)
        : 0;

  const requiredMissing = requiredQuestions.some((q) => isEmpty(responses[q.id]));
  const interactive = !readOnly && !preview;

  function setValue(id: string, value: unknown) {
    onChange({ ...responses, [id]: value });
  }

  async function handleSave() {
    if (!onSave) return;
    await onSave();
    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 2500);
  }

  return (
    <div className="ui-assessment-form">
      {preview ? (
        <p className="ui-assessment-form__preview-banner">Patient view preview — answers are not saved</p>
      ) : null}

      {submittedBanner && readOnly ? (
        <div className="ui-assessment-form__done">
          <strong>Evaluation submitted</strong>
          {completedAt ? (
            <span className="ui-muted">
              {" "}
              ·{" "}
              {new Date(completedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      {interactive && questions.length > 0 ? (
        <div className="ui-assessment-form__progress" aria-live="polite">
          <div className="ui-assessment-form__progress-meta">
            <span>
              Progress {requiredQuestions.length > 0 ? `${requiredAnswered} of ${requiredQuestions.length} required` : `${answeredCount} of ${questions.length}`}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="ui-assessment-form__progress-track" aria-hidden="true">
            <div className="ui-assessment-form__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? <p className="ui-muted">No questions yet.</p> : null}

      {sections.map((section) => (
        <section key={section.id} className="ui-assessment-form__section">
          {section.title ? <h3 className="ui-assessment-form__section-title">{section.title}</h3> : null}
          {section.questions.map((q, index) => (
            <div key={q.id} className="ui-assessment-q">
              <div className="ui-assessment-q__label">
                <span className="ui-assessment-q__index">{index + 1}.</span> {q.label}
                {q.required ? <span className="ui-assessment-q__required">Required</span> : null}
              </div>
              {q.active === false ? <div className="ui-assessment-q__meta">Inactive</div> : null}
              {readOnly ? (
                <div className="ui-assessment-q__answer">{formatAnswer(responses[q.id], q)}</div>
              ) : (
                <QuestionControl question={q} value={responses[q.id]} onChange={(v) => setValue(q.id, v)} />
              )}
            </div>
          ))}
        </section>
      ))}

      {interactive ? (
        <div className="ui-assessment-form__actions">
          {onSave ? (
            <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save & continue"}
            </Button>
          ) : null}
          {onComplete ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving || requiredMissing}
              onClick={() => setConfirmSubmit(true)}
            >
              Submit assessment
            </Button>
          ) : null}
          {savedHint ? <span className="ui-assessment-form__saved">Progress saved</span> : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit this evaluation?"
        description="You will not be able to change your answers after submitting."
        confirmLabel="Submit assessment"
        pending={saving}
        onConfirm={() => {
          setConfirmSubmit(false);
          void onComplete?.();
        }}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}

function QuestionControl({
  question,
  value,
  onChange,
}: {
  question: AssessmentQuestionView;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = question.type.toUpperCase();
  if (type === "TEXTAREA") {
    return (
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }
  if (type === "NUMBER") {
    return (
      <Input
        type="number"
        value={value == null || value === "" ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }
  if (type === "BOOLEAN") {
    return (
      <div className="ui-assessment-q__bool">
        <Button
          type="button"
          size="sm"
          variant={value === true ? "primary" : "secondary"}
          onClick={() => onChange(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === false ? "primary" : "secondary"}
          onClick={() => onChange(false)}
        >
          No
        </Button>
      </div>
    );
  }
  if (type === "SINGLE_CHOICE") {
    return (
      <Select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {(question.options ?? []).map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </Select>
    );
  }
  if (type === "MULTI_CHOICE") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="ui-stack" style={{ gap: "0.35rem" }}>
        {(question.options ?? []).map((opt) => (
          <Checkbox
            key={opt.id}
            label={opt.label}
            checked={selected.includes(opt.id)}
            onChange={(e) => {
              if (e.target.checked) onChange([...selected, opt.id]);
              else onChange(selected.filter((id) => id !== opt.id));
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <Input
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function formatAnswer(value: unknown, q: AssessmentQuestionView): string {
  if (value == null || value === "") return "—";
  if (q.type === "BOOLEAN") return value ? "Yes" : "No";
  if (q.type === "SINGLE_CHOICE") {
    const opt = q.options?.find((o) => o.id === value);
    return opt?.label ?? String(value);
  }
  if (q.type === "MULTI_CHOICE" && Array.isArray(value)) {
    return value
      .map((id) => q.options?.find((o) => o.id === id)?.label ?? String(id))
      .join(", ");
  }
  return String(value);
}

export function AssessmentQuestionFields({
  draft,
  onChange,
}: {
  draft: {
    id: string;
    type: string;
    label: string;
    required?: boolean;
    options?: Array<{ id: string; label: string }>;
  };
  onChange: (next: {
    id: string;
    type: string;
    label: string;
    required?: boolean;
    options?: Array<{ id: string; label: string }>;
  }) => void;
}) {
  const needsOptions = draft.type === "SINGLE_CHOICE" || draft.type === "MULTI_CHOICE";
  return (
    <div className="ui-client-chart__form-grid">
      <Field label="Question">
        <Input
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder="What is your main nutrition goal?"
        />
      </Field>
      <Field label="Answer type">
        <Select value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value })}>
          <option value="TEXT">Short answer</option>
          <option value="TEXTAREA">Long answer</option>
          <option value="NUMBER">Number</option>
          <option value="BOOLEAN">Yes / No</option>
          <option value="SINGLE_CHOICE">Single choice</option>
          <option value="MULTI_CHOICE">Multiple choice</option>
        </Select>
      </Field>
      <Field label="Required">
        <Checkbox
          checked={Boolean(draft.required)}
          onChange={(e) => onChange({ ...draft, required: e.target.checked })}
          label="Required"
        />
      </Field>
      {needsOptions ? (
        <Field label="Choices (comma-separated)">
          <Input
            value={(draft.options ?? []).map((o) => o.label).join(", ")}
            onChange={(e) => {
              const labels = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              onChange({
                ...draft,
                options: labels.map((label, i) => ({
                  id: draft.options?.[i]?.id ?? `opt-${i + 1}`,
                  label,
                })),
              });
            }}
            placeholder="Dairy, Nuts, Gluten"
          />
        </Field>
      ) : null}
    </div>
  );
}
