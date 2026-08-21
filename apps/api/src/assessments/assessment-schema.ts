import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const ASSESSMENT_QUESTION_TYPES = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "BOOLEAN",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
] as const;

export type AssessmentQuestionType = (typeof ASSESSMENT_QUESTION_TYPES)[number];

export type AssessmentQuestionOption = { id: string; label: string };

export type AssessmentQuestion = {
  id: string;
  type: AssessmentQuestionType;
  label: string;
  required?: boolean;
  /** Soft-deactivate; historical responses remain readable via schemaSnapshot. */
  active?: boolean;
  options?: AssessmentQuestionOption[];
};

export type AssessmentSection = {
  id: string;
  title?: string;
  questions: AssessmentQuestion[];
};

export type AssessmentSchema = {
  sections: AssessmentSection[];
};

export function emptyAssessmentSchema(): AssessmentSchema {
  return { sections: [{ id: "main", title: "Questions", questions: [] }] };
}

export function parseAssessmentSchema(raw: unknown): AssessmentSchema {
  if (!raw || typeof raw !== "object") {
    return emptyAssessmentSchema();
  }
  const sectionsRaw = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sectionsRaw)) {
    return emptyAssessmentSchema();
  }
  const sections: AssessmentSection[] = sectionsRaw.map((section, sIdx) => {
    if (!section || typeof section !== "object") {
      throw new BadRequestException(`Invalid assessment section at index ${sIdx}`);
    }
    const s = section as Record<string, unknown>;
    const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `section-${sIdx + 1}`;
    const title = typeof s.title === "string" ? s.title : undefined;
    const questionsRaw = Array.isArray(s.questions) ? s.questions : [];
    const questions: AssessmentQuestion[] = questionsRaw.map((q, qIdx) => parseQuestion(q, sIdx, qIdx));
    return { id, title, questions };
  });
  return { sections };
}

function parseQuestion(raw: unknown, sIdx: number, qIdx: number): AssessmentQuestion {
  if (!raw || typeof raw !== "object") {
    throw new BadRequestException(`Invalid question at section ${sIdx} index ${qIdx}`);
  }
  const q = raw as Record<string, unknown>;
  const id = typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q-${sIdx + 1}-${qIdx + 1}`;
  const type = String(q.type ?? "TEXT").toUpperCase() as AssessmentQuestionType;
  if (!ASSESSMENT_QUESTION_TYPES.includes(type)) {
    throw new BadRequestException(`Unsupported question type: ${String(q.type)}`);
  }
  const label = typeof q.label === "string" && q.label.trim() ? q.label.trim() : `Question ${qIdx + 1}`;
  const required = Boolean(q.required);
  const active = q.active === false ? false : true;
  let options: AssessmentQuestionOption[] | undefined;
  if (type === "SINGLE_CHOICE" || type === "MULTI_CHOICE") {
    const opts = Array.isArray(q.options) ? q.options : [];
    options = opts.map((opt, oIdx) => {
      if (!opt || typeof opt !== "object") {
        throw new BadRequestException(`Invalid option at question ${id}`);
      }
      const o = opt as Record<string, unknown>;
      return {
        id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : `opt-${oIdx + 1}`,
        label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : `Option ${oIdx + 1}`,
      };
    });
  }
  return { id, type, label, required, active, options };
}

export function toPrismaSchema(schema: AssessmentSchema): Prisma.InputJsonValue {
  return schema as unknown as Prisma.InputJsonValue;
}

export function activeQuestions(schema: AssessmentSchema): AssessmentQuestion[] {
  return schema.sections.flatMap((s) => s.questions.filter((q) => q.active !== false));
}

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean" || typeof value === "number") return true;
  return false;
}

function optionIds(question: AssessmentQuestion): Set<string> {
  return new Set((question.options ?? []).map((o) => o.id));
}

function assertQuestionValue(question: AssessmentQuestion, value: unknown): void {
  switch (question.type) {
    case "TEXT":
    case "TEXTAREA":
      if (typeof value !== "string") {
        throw new BadRequestException(`Answer for "${question.label}" must be text`);
      }
      return;
    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new BadRequestException(`Answer for "${question.label}" must be a number`);
      }
      return;
    case "BOOLEAN":
      if (typeof value !== "boolean") {
        throw new BadRequestException(`Answer for "${question.label}" must be yes or no`);
      }
      return;
    case "SINGLE_CHOICE": {
      if (typeof value !== "string") {
        throw new BadRequestException(`Answer for "${question.label}" must be a single choice`);
      }
      if (!optionIds(question).has(value)) {
        throw new BadRequestException(`Answer for "${question.label}" is not a valid option`);
      }
      return;
    }
    case "MULTI_CHOICE": {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new BadRequestException(`Answer for "${question.label}" must be a list of choices`);
      }
      const allowed = optionIds(question);
      for (const id of value as string[]) {
        if (!allowed.has(id)) {
          throw new BadRequestException(`Answer for "${question.label}" contains an invalid option`);
        }
      }
      return;
    }
    default:
      throw new BadRequestException(`Unsupported question type: ${question.type}`);
  }
}

/**
 * Validate client responses against a frozen assessment schema (snapshot).
 * - save: validate present values only; missing required is allowed
 * - complete: all required active questions must be answered
 * Inactive questions are not required; stray answers for unknown/inactive ids are ignored.
 */
export function validateAssessmentResponses(
  schema: AssessmentSchema,
  responses: unknown,
  options: { mode: "save" | "complete" },
): Record<string, unknown> {
  const parsed = parseAssessmentSchema(schema);
  const active = activeQuestions(parsed);
  const byId = new Map(active.map((q) => [q.id, q]));

  if (responses !== null && responses !== undefined && (typeof responses !== "object" || Array.isArray(responses))) {
    throw new BadRequestException("Responses must be an object");
  }
  const raw = (responses ?? {}) as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const question = byId.get(key);
    if (!question) continue;
    if (!isAnswered(value)) continue;
    assertQuestionValue(question, value);
    cleaned[key] = value;
  }

  if (options.mode === "complete") {
    for (const question of active) {
      if (!question.required) continue;
      if (!isAnswered(cleaned[question.id])) {
        throw new BadRequestException(`Required question unanswered: ${question.label}`);
      }
    }
  }

  return cleaned;
}

export function upsertQuestion(
  schema: AssessmentSchema,
  sectionId: string,
  question: AssessmentQuestion,
): AssessmentSchema {
  const parsed = parseAssessmentSchema(schema);
  const sections = parsed.sections.map((section) => {
    if (section.id !== sectionId) return section;
    const idx = section.questions.findIndex((q) => q.id === question.id);
    const nextQ = parseQuestion(question, 0, 0);
    if (idx >= 0) {
      const questions = [...section.questions];
      questions[idx] = nextQ;
      return { ...section, questions };
    }
    return { ...section, questions: [...section.questions, nextQ] };
  });
  if (!sections.some((s) => s.id === sectionId)) {
    sections.push({ id: sectionId, title: "Questions", questions: [parseQuestion(question, 0, 0)] });
  }
  return { sections };
}

export function deactivateQuestion(schema: AssessmentSchema, questionId: string): AssessmentSchema {
  const parsed = parseAssessmentSchema(schema);
  return {
    sections: parsed.sections.map((section) => ({
      ...section,
      questions: section.questions.map((q) => (q.id === questionId ? { ...q, active: false } : q)),
    })),
  };
}

export function reorderQuestions(
  schema: AssessmentSchema,
  sectionId: string,
  orderedIds: string[],
): AssessmentSchema {
  const parsed = parseAssessmentSchema(schema);
  return {
    sections: parsed.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const byId = new Map(section.questions.map((q) => [q.id, q]));
      const ordered: AssessmentQuestion[] = [];
      for (const id of orderedIds) {
        const q = byId.get(id);
        if (q) {
          ordered.push(q);
          byId.delete(id);
        }
      }
      for (const q of byId.values()) ordered.push(q);
      return { ...section, questions: ordered };
    }),
  };
}
