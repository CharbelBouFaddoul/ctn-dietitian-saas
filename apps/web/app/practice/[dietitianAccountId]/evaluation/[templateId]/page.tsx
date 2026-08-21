"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Section,
} from "@nutrition-saas/ui";
import {
  AssessmentQuestionFields,
  questionTypeLabel,
  type AssessmentSchemaView,
} from "../../../../../components/assessment-form";
import { api } from "../../../../../lib/api";
import { countActiveQuestions, type EvaluationTemplate } from "../../../../../lib/evaluation";
import { errorMessage } from "../../../../../lib/humanize-error";
import { usePractice } from "../../practice-shell";

export default function EvaluationFormEditorPage() {
  const { dietitianAccountId } = usePractice();
  const params = useParams<{ templateId: string }>();
  const searchParams = useSearchParams();
  const templateId = params.templateId;
  const fromClient = searchParams.get("fromClient");
  const fromClientQs = fromClient ? `?fromClient=${encodeURIComponent(fromClient)}` : "";
  const listHref = `/practice/${dietitianAccountId}/evaluation${fromClientQs}`;
  const clientEvalsHref = fromClient
    ? `/practice/${dietitianAccountId}/clients/${fromClient}?tab=assessments`
    : null;
  const apiBase = `/api/v1/dietitian/${dietitianAccountId}`;

  const [template, setTemplate] = useState<EvaluationTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    id: `q-${crypto.randomUUID().slice(0, 8)}`,
    type: "TEXT",
    label: "",
    required: false,
    options: [] as Array<{ id: string; label: string }>,
  });

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
  const questions = schema.sections.flatMap((s) => s.questions);

  async function saveMeta() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`${apiBase}/assessment-templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description: description || undefined }),
      });
      setNotice("Form details saved.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to save form"));
    } finally {
      setBusy(false);
    }
  }

  function reorder(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const ids = questions.map((x) => x.id);
    const next = [...ids];
    const tmp = next[nextIndex]!;
    next[nextIndex] = next[index]!;
    next[index] = tmp;
    setBusy(true);
    void api(`${apiBase}/assessment-templates/${templateId}/questions/reorder`, {
      method: "POST",
      body: JSON.stringify({ sectionId: "main", orderedIds: next }),
    })
      .then(() => load())
      .catch((err) => setError(errorMessage(err, "Unable to reorder")))
      .finally(() => setBusy(false));
  }

  if (!template) {
    return error ? <Alert tone="danger">{error}</Alert> : <p className="ui-muted">Loading form…</p>;
  }

  return (
    <section className="ui-eval">
      <Breadcrumbs
        items={[
          { label: "Form library", href: listHref },
          { label: template.name },
        ]}
      />
      <PageHeader
        eyebrow="Form library"
        title={template.name}
        description={`${countActiveQuestions(template.schema)} active questions · Edit wording, types, and order.`}
        actions={
          <div className="ui-eval__header-actions">
            <Link
              href={`/practice/${dietitianAccountId}/evaluation/${templateId}/preview${fromClientQs}`}
              className="ui-btn ui-btn--secondary ui-btn--sm"
            >
              Preview
            </Link>
            <Link href={listHref} className="ui-btn ui-btn--secondary ui-btn--sm">
              Back to library
            </Link>
            {clientEvalsHref ? (
              <Link href={clientEvalsHref} className="ui-btn ui-btn--secondary ui-btn--sm">
                Back to client
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="ui-eval__layout">
        <div className="ui-eval__main">
          <Section title="Questions">
            {questions.length === 0 ? (
              <EmptyState title="No questions yet">Add the first question on the right.</EmptyState>
            ) : (
              <ul className="ui-eval__question-list">
                {questions.map((q, index) => (
                  <li key={q.id} className={q.active === false ? "is-inactive" : undefined}>
                    <div>
                      <strong>
                        {index + 1}. {q.label}
                      </strong>
                      <p className="ui-eval__card-meta">
                        {questionTypeLabel(q.type)}
                        {q.required ? " · Required" : ""}
                        {q.active === false ? " · Inactive" : ""}
                      </p>
                    </div>
                    <div className="ui-eval__card-actions">
                      <Button size="sm" variant="secondary" disabled={busy || index === 0} onClick={() => reorder(index, -1)}>
                        Up
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || index >= questions.length - 1}
                        onClick={() => reorder(index, 1)}
                      >
                        Down
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || q.active === false}
                        onClick={() => {
                          setBusy(true);
                          void api(
                            `${apiBase}/assessment-templates/${templateId}/questions/${encodeURIComponent(q.id)}/deactivate`,
                            { method: "POST" },
                          )
                            .then(() => load())
                            .catch((err) => setError(errorMessage(err, "Unable to deactivate")))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="ui-eval__aside">
          <Section title="Form details">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short description"
              />
            </Field>
            <Button type="button" disabled={busy || !name.trim()} onClick={() => void saveMeta()}>
              Save details
            </Button>
          </Section>

          <Section title="Add question">
            <form
              className="ui-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.label.trim()) return;
                setBusy(true);
                void api(`${apiBase}/assessment-templates/${templateId}/questions`, {
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
                    return load();
                  })
                  .catch((err) => setError(errorMessage(err, "Unable to add question")))
                  .finally(() => setBusy(false));
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
              <Button type="submit" disabled={busy || !draft.label.trim()}>
                Add question
              </Button>
            </form>
          </Section>
        </aside>
      </div>
    </section>
  );
}
