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
  responses?: Record<string, unknown> | null;
  schema?: AssessmentSchemaView;
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

function isEmptyAnswer(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Answered active questions vs total active questions on the form. */
export function assessmentProgress(row: {
  responses?: Record<string, unknown> | null;
  schema?: AssessmentSchemaView;
}): { answered: number; total: number; requiredAnswered: number; requiredTotal: number } {
  const questions =
    row.schema?.sections.flatMap((s) => s.questions).filter((q) => q.active !== false) ?? [];
  const responses = row.responses ?? {};
  const answered = questions.filter((q) => !isEmptyAnswer(responses[q.id])).length;
  const required = questions.filter((q) => q.required);
  const requiredAnswered = required.filter((q) => !isEmptyAnswer(responses[q.id])).length;
  return {
    answered,
    total: questions.length,
    requiredAnswered,
    requiredTotal: required.length,
  };
}

export function emptyEvaluationSchema(): AssessmentSchemaView {
  return { sections: [{ id: "main", title: "Questions", questions: [] }] };
}
