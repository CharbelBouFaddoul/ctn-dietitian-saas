import type { AiAction } from "@prisma/client";

export const AI_PROMPT_VERSIONS: Record<AiAction, string> = {
  CLIENT_SUMMARY: "CLIENT_SUMMARY_V1",
  MEAL_PLAN_ASSISTANCE: "MEAL_PLAN_ASSISTANT_V1",
  NUTRITION_ASSISTANCE: "NUTRITION_ASSISTANT_V1",
  CONSULTATION_SUMMARY: "CONSULTATION_SUMMARY_V1",
  MESSAGE_DRAFT: "MESSAGE_DRAFT_V1",
};

const SAFETY = [
  "You are an assistant for a professional dietitian.",
  "Do not diagnose medical conditions.",
  "Do not prescribe treatment or medication.",
  "Do not present output as authoritative clinical fact.",
  "Provide suggestions for dietitian review only.",
  "Respond with valid JSON only.",
].join(" ");

export function buildSystemPrompt(action: AiAction): string {
  const version = AI_PROMPT_VERSIONS[action];
  switch (action) {
    case "CLIENT_SUMMARY":
      return `${SAFETY} ${version}. Summarize the provided client context for a dietitian. JSON keys: overview, observations[], adherence[], areas_to_review[], suggested_questions[].`;
    case "MEAL_PLAN_ASSISTANCE":
      return `${SAFETY} ${version}. Suggest meal ideas and substitutions from the provided context. Do not publish or modify records. JSON keys: suggestions[{title,meal,notes}], substitutions[{from,to,reason}], notes[].`;
    case "NUTRITION_ASSISTANCE":
      return `${SAFETY} ${version}. Explain nutrition concepts using provided food data only. Do not invent database nutrition values. JSON keys: explanation, talking_points[], notes[].`;
    case "CONSULTATION_SUMMARY":
      return `${SAFETY} ${version}. Summarize consultation-relevant information. JSON keys: summary, key_points[], follow_up_questions[], action_items[].`;
    case "MESSAGE_DRAFT":
      return `${SAFETY} ${version}. Draft a professional client message for dietitian review. Never send automatically. JSON keys: subject, body.`;
    default:
      return SAFETY;
  }
}

export function buildUserPrompt(action: AiAction, context: unknown, userInput?: string): string {
  const payload = {
    context,
    dietitian_request: userInput?.trim() || null,
  };
  return JSON.stringify(payload);
}
