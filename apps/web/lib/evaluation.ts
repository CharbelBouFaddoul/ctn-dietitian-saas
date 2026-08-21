import type { AssessmentSchemaView } from "../components/assessment-form";

export type EvaluationTemplate = {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  status?: string;
  schema?: AssessmentSchemaView;
  updatedAt?: string;
  createdAt?: string;
};

export type EvaluationAssessment = {
  id: string;
  status: string;
  templateName: string;
  templateVersion: number;
  createdAt: string;
  completedAt: string | null;
  startedAt?: string | null;
};

export type EvaluationAssessmentDetail = EvaluationAssessment & {
  responses: Record<string, unknown> | null;
  schema: AssessmentSchemaView;
};

export function evaluationStatusLabel(status: string): string {
  if (status === "COMPLETED") return "Submitted";
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "DRAFT") return "Not started";
  if (status === "ARCHIVED") return "Archived";
  return status;
}

export function countActiveQuestions(schema?: AssessmentSchemaView): number {
  if (!schema) return 0;
  return schema.sections.flatMap((s) => s.questions).filter((q) => q.active !== false).length;
}

export function emptyEvaluationSchema(): AssessmentSchemaView {
  return { sections: [{ id: "main", title: "Questions", questions: [] }] };
}
