"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@nutrition-saas/ui";

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
  onSave?: () => void;
  onComplete?: () => void;
  saving?: boolean;
  showInactive?: boolean;
};

export function AssessmentForm({
  schema,
  responses,
  onChange,
  readOnly = false,
  onSave,
  onComplete,
  saving = false,
  showInactive = false,
}: Props) {
  const questions = useMemo(
    () =>
      schema.sections.flatMap((s) =>
        s.questions
          .filter((q) => showInactive || q.active !== false)
          .map((q) => ({ ...q, sectionTitle: s.title })),
      ),
    [schema, showInactive],
  );

  const requiredMissing = questions.some(
    (q) => q.required && q.active !== false && isEmpty(responses[q.id]),
  );

  function setValue(id: string, value: unknown) {
    onChange({ ...responses, [id]: value });
  }

  return (
    <div className="ui-assessment-form">
      {questions.length === 0 ? <p className="ui-muted">No active questions.</p> : null}
      {questions.map((q) => (
        <div key={q.id} className="ui-assessment-q">
          <div className="ui-assessment-q__label">
            {q.label}
            {q.required ? " *" : ""}
          </div>
          {q.active === false ? <div className="ui-assessment-q__meta">Inactive</div> : null}
          {readOnly ? (
            <div>{formatAnswer(responses[q.id], q)}</div>
          ) : (
            <QuestionControl question={q} value={responses[q.id]} onChange={(v) => setValue(q.id, v)} />
          )}
        </div>
      ))}
      {!readOnly ? (
        <div className="ui-client-chart__toolbar">
          {onSave ? (
            <Button type="button" variant="secondary" disabled={saving} onClick={onSave}>
              Save draft
            </Button>
          ) : null}
          {onComplete ? (
            <Button type="button" disabled={saving || requiredMissing} onClick={onComplete}>
              Submit
            </Button>
          ) : null}
        </div>
      ) : null}
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
      <Checkbox
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        label="Yes"
      />
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

function formatAnswer(value: unknown, q: AssessmentQuestionView): string {
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

export function NewQuestionDraft() {
  const [id] = useState(() => `q-${crypto.randomUUID().slice(0, 8)}`);
  return {
    id,
    type: "TEXT" as const,
    label: "",
    required: false,
    active: true,
    options: [] as Array<{ id: string; label: string }>,
  };
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
      <Field label="Label">
        <Input value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} />
      </Field>
      <Field label="Type">
        <Select value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value })}>
          <option value="TEXT">Text</option>
          <option value="TEXTAREA">Long text</option>
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
        <Field label="Options (comma-separated)">
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
          />
        </Field>
      ) : null}
    </div>
  );
}
