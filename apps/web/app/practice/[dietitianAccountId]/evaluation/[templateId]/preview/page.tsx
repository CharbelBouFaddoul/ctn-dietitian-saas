"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, Breadcrumbs, PageHeader } from "@nutrition-saas/ui";
import { AssessmentForm, type AssessmentSchemaView } from "../../../../../../components/assessment-form";
import { api } from "../../../../../../lib/api";
import { type EvaluationTemplate } from "../../../../../../lib/evaluation";
import { errorMessage } from "../../../../../../lib/humanize-error";
import { usePractice } from "../../../practice-shell";

export default function EvaluationFormPreviewPage() {
  const { dietitianAccountId } = usePractice();
  const params = useParams<{ templateId: string }>();
  const searchParams = useSearchParams();
  const templateId = params.templateId;
  const fromClient = searchParams.get("fromClient");
  const fromClientQs = fromClient ? `?fromClient=${encodeURIComponent(fromClient)}` : "";
  const listHref = `/practice/${dietitianAccountId}/evaluation${fromClientQs}`;
  const editorHref = `/practice/${dietitianAccountId}/evaluation/${templateId}${fromClientQs}`;
  const [template, setTemplate] = useState<EvaluationTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<EvaluationTemplate>(`/api/v1/dietitian/${dietitianAccountId}/assessment-templates/${templateId}`)
      .then(setTemplate)
      .catch((err) => setError(errorMessage(err, "Unable to load preview")));
  }, [dietitianAccountId, templateId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!template) return <p className="ui-muted">Loading preview…</p>;

  const schema: AssessmentSchemaView = template.schema ?? { sections: [] };

  return (
    <section className="ui-eval">
      <Breadcrumbs
        items={[
          { label: "Form library", href: listHref },
          { label: template.name, href: editorHref },
          { label: "Preview" },
        ]}
      />
      <PageHeader
        eyebrow="Patient view preview"
        title={template.name}
        description="This is how the questionnaire appears to patients. Answers here are not saved."
        actions={
          <Link href={editorHref} className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to editor
          </Link>
        }
      />
      <div className="ui-eval__preview-shell">
        <AssessmentForm schema={schema} responses={responses} onChange={setResponses} preview />
      </div>
    </section>
  );
}
