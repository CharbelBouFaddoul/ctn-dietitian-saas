"use client";

import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  Field,
  Section,
  Select,
  StatusBadge,
  humanizeLabel,
} from "@nutrition-saas/ui";
import {
  AssessmentForm,
  AssessmentQuestionFields,
  type AssessmentSchemaView,
} from "./assessment-form";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";

type TemplateRow = {
  id: string;
  name: string;
  version: number;
  status?: string;
  schema?: AssessmentSchemaView;
};
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

type Props = {
  base: string;
  orgBase: string;
  allowManage: boolean;
  onError: (message: string) => void;
  onPortfolioRefresh: () => Promise<void>;
};

export function ClientAssessmentsPanel({
  base,
  orgBase,
  allowManage,
  onError,
  onPortfolioRefresh,
}: Props) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [editorTemplate, setEditorTemplate] = useState<TemplateRow | null>(null);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [selected, setSelected] = useState<AssessmentDetail | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    id: `q-${crypto.randomUUID().slice(0, 8)}`,
    type: "TEXT",
    label: "",
    required: false,
    options: [] as Array<{ id: string; label: string }>,
  });

  async function loadTemplates() {
    const rows = await api<TemplateRow[]>(`${orgBase}/assessment-templates?includeInactive=true`);
    setTemplates(rows);
    const active = rows.filter((r) => !r.status || r.status === "ACTIVE");
    if (!templateId && active[0]) setTemplateId(active[0].id);
    else if (!templateId && rows[0]) setTemplateId(rows[0].id);
  }

  async function loadAssessments() {
    const rows = await api<AssessmentRow[]>(`${base}/assessments`);
    setAssessments(rows);
  }

  async function openTemplateEditor(id: string) {
    const row = await api<TemplateRow>(`${orgBase}/assessment-templates/${id}`);
    setEditorTemplate(row);
  }

  async function openAssessment(id: string) {
    const row = await api<AssessmentDetail>(`${base}/assessments/${id}`);
    setSelected(row);
    setResponses((row.responses as Record<string, unknown>) ?? {});
  }

  useEffect(() => {
    void Promise.all([loadTemplates(), loadAssessments()]).catch((err) =>
      onError(errorMessage(err, "Unable to load assessments")),
    );
  }, [base, orgBase]);

  const schema = editorTemplate?.schema ?? { sections: [{ id: "main", questions: [] }] };
  const questions = schema.sections.flatMap((s) => s.questions);

  return (
    <div className="ui-client-chart__panel ui-stack">
      <Section title="Templates">
        <div className="ui-client-chart__toolbar">
          <Field label="Template">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates
                .filter((t) => !t.status || t.status === "ACTIVE")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (v{t.version})
                  </option>
                ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="secondary"
            disabled={!templateId}
            onClick={() => void openTemplateEditor(templateId).catch((err) => onError(errorMessage(err)))}
          >
            Edit questions
          </Button>
          <Button
            type="button"
            disabled={!templateId || !allowManage}
            onClick={() => {
              void api(`${base}/assessments`, {
                method: "POST",
                body: JSON.stringify({ templateId }),
              })
                .then(() => Promise.all([loadAssessments(), onPortfolioRefresh()]))
                .catch((err) => onError(errorMessage(err, "Unable to start assessment")));
            }}
          >
            Start for client
          </Button>
          {allowManage ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void api<TemplateRow>(`${orgBase}/assessment-templates`, {
                  method: "POST",
                  body: JSON.stringify({
                    name: "Intake assessment",
                    schema: { sections: [{ id: "main", title: "Questions", questions: [] }] },
                  }),
                })
                  .then((row) => {
                    setTemplateId(row.id);
                    return loadTemplates().then(() => openTemplateEditor(row.id));
                  })
                  .catch((err) => onError(errorMessage(err, "Unable to create template")));
              }}
            >
              New template
            </Button>
          ) : null}
        </div>
      </Section>

      {editorTemplate ? (
        <Section
          title={`Edit · ${editorTemplate.name}`}
          actions={
            <Button variant="secondary" size="sm" onClick={() => setEditorTemplate(null)}>
              Close editor
            </Button>
          }
        >
          {questions.length === 0 ? <EmptyState title="No questions yet" /> : null}
          <ul className="ui-client-chart__list">
            {questions.map((q, index) => (
              <li key={q.id} className={q.active === false ? "is-inactive" : undefined}>
                <span>
                  {index + 1}. {q.label}{" "}
                  <span className="ui-muted">
                    · {q.type}
                    {q.active === false ? " · inactive" : ""}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!allowManage || index === 0}
                    onClick={() => {
                      const ids = questions.map((x) => x.id);
                      const next = [...ids];
                      const tmp = next[index - 1]!;
                      next[index - 1] = next[index]!;
                      next[index] = tmp;
                      void api(`${orgBase}/assessment-templates/${editorTemplate.id}/questions/reorder`, {
                        method: "POST",
                        body: JSON.stringify({ sectionId: "main", orderedIds: next }),
                      })
                        .then(() => openTemplateEditor(editorTemplate.id))
                        .catch((err) => onError(errorMessage(err)));
                    }}
                  >
                    Up
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!allowManage || q.active === false}
                    onClick={() => {
                      void api(
                        `${orgBase}/assessment-templates/${editorTemplate.id}/questions/${encodeURIComponent(q.id)}/deactivate`,
                        { method: "POST" },
                      )
                        .then(() => openTemplateEditor(editorTemplate.id))
                        .catch((err) => onError(errorMessage(err)));
                    }}
                  >
                    Deactivate
                  </Button>
                </span>
              </li>
            ))}
          </ul>

          {allowManage ? (
            <form
              className="ui-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.label.trim()) return;
                void api(`${orgBase}/assessment-templates/${editorTemplate.id}/questions`, {
                  method: "POST",
                  body: JSON.stringify({
                    sectionId: "main",
                    id: draft.id,
                    type: draft.type,
                    label: draft.label,
                    required: draft.required,
                    active: true,
                    options: draft.options,
                  }),
                })
                  .then(() => {
                    setDraft({
                      id: `q-${crypto.randomUUID().slice(0, 8)}`,
                      type: "TEXT",
                      label: "",
                      required: false,
                      options: [],
                    });
                    return openTemplateEditor(editorTemplate.id);
                  })
                  .catch((err) => onError(errorMessage(err, "Unable to add question")));
              }}
            >
              <AssessmentQuestionFields
                draft={draft}
                onChange={(next) =>
                  setDraft({
                    id: next.id,
                    type: next.type,
                    label: next.label,
                    required: Boolean(next.required),
                    options: next.options ?? [],
                  })
                }
              />
              <Button type="submit">Add question</Button>
            </form>
          ) : null}
        </Section>
      ) : null}

      <Section title="Client assessments">
        {assessments.length === 0 ? (
          <EmptyState title="No assessments yet" />
        ) : (
          <ul className="ui-client-chart__list">
            {assessments.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="ui-link"
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontWeight: 500 }}
                  onClick={() =>
                    void openAssessment(row.id).catch((err) =>
                      onError(errorMessage(err, "Unable to load assessment")),
                    )
                  }
                >
                  {row.templateName} <span className="ui-muted">v{row.templateVersion}</span>
                </button>
                <StatusBadge status={row.status} label={humanizeLabel(row.status)} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {selected ? (
        <Section
          title={`${selected.templateName} · ${humanizeLabel(selected.status)}`}
          actions={
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          }
        >
          <AssessmentForm
            schema={selected.schema}
            responses={responses}
            onChange={setResponses}
            readOnly={selected.status === "COMPLETED" || selected.status === "ARCHIVED" || !allowManage}
            showInactive={selected.status === "COMPLETED"}
            saving={saving}
            onSave={
              selected.status === "COMPLETED" || !allowManage
                ? undefined
                : () => {
                    setSaving(true);
                    void api<AssessmentDetail>(`${base}/assessments/${selected.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ responses }),
                    })
                      .then((row) => {
                        setSelected(row);
                        setResponses((row.responses as Record<string, unknown>) ?? {});
                      })
                      .catch((err: unknown) => onError(errorMessage(err, "Unable to save")))
                      .finally(() => setSaving(false));
                  }
            }
            onComplete={
              selected.status === "COMPLETED" || !allowManage
                ? undefined
                : () => {
                    setSaving(true);
                    void api<AssessmentDetail>(`${base}/assessments/${selected.id}/complete`, {
                      method: "POST",
                      body: JSON.stringify({ responses }),
                    })
                      .then((row) => {
                        setSelected(row);
                        setResponses((row.responses as Record<string, unknown>) ?? {});
                        return Promise.all([loadAssessments(), onPortfolioRefresh()]);
                      })
                      .catch((err: unknown) => onError(errorMessage(err, "Unable to complete")))
                      .finally(() => setSaving(false));
                  }
            }
          />
        </Section>
      ) : null}
    </div>
  );
}
