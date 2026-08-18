import { Injectable } from "@nestjs/common";
import type { AiAction } from "@prisma/client";
import type { AiCompletionInput, AiCompletionResult, AiProvider } from "./ai.provider";

const MOCK_OUTPUT: Record<AiAction, object> = {
  CLIENT_SUMMARY: {
    overview: "Client shows steady engagement with recent tracking activity.",
    observations: ["Water intake has been consistent.", "Exercise logs appear 2–3 times per week."],
    adherence: ["Meal plan visibility is active.", "Habit completion is moderate."],
    areas_to_review: ["Review sleep patterns at next visit."],
    suggested_questions: ["What barriers affect weekday meal prep?", "How is energy after workouts?"],
  },
  MEAL_PLAN_ASSISTANCE: {
    suggestions: [
      { title: "Greek yogurt bowl", meal: "Breakfast", notes: "High protein start" },
      { title: "Grilled salmon salad", meal: "Lunch", notes: "Omega-3 variety" },
    ],
    substitutions: [{ from: "White rice", to: "Quinoa", reason: "More fiber and protein" }],
    notes: ["Review all suggestions before updating the meal plan."],
  },
  NUTRITION_ASSISTANCE: {
    explanation: "Use the application food database for authoritative nutrition values.",
    talking_points: ["Compare portion sizes with client goals.", "Highlight fiber and protein balance."],
    notes: ["Do not treat this as a diagnosis or prescription."],
  },
  CONSULTATION_SUMMARY: {
    summary: "Client progress is stable with room to improve consistency on weekends.",
    key_points: ["Tracking activity present in the last 14 days.", "Active meal plan published."],
    follow_up_questions: ["What support would help weekend adherence?"],
    action_items: ["Review habit log trends", "Confirm next appointment goals"],
  },
  MESSAGE_DRAFT: {
    subject: "Follow-up from your dietitian",
    body: "Hi, I reviewed your recent logs and have a few suggestions for our next check-in. Please let me know if any questions come up before then.",
  },
};

@Injectable()
export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const action = this.detectAction(input.system);
    const payload = action ? MOCK_OUTPUT[action] : { message: "Mock AI response" };
    const content = input.responseFormat === "json" ? JSON.stringify(payload) : String(payload);
    return {
      content,
      inputTokens: Math.ceil((input.system.length + input.user.length) / 4),
      outputTokens: Math.ceil(content.length / 4),
      model: "mock-model",
      provider: this.name,
    };
  }

  private detectAction(system: string): AiAction | null {
    if (system.includes("CLIENT_SUMMARY_V1")) return "CLIENT_SUMMARY";
    if (system.includes("MEAL_PLAN_ASSISTANT_V1")) return "MEAL_PLAN_ASSISTANCE";
    if (system.includes("NUTRITION_ASSISTANT_V1")) return "NUTRITION_ASSISTANCE";
    if (system.includes("CONSULTATION_SUMMARY_V1")) return "CONSULTATION_SUMMARY";
    if (system.includes("MESSAGE_DRAFT_V1")) return "MESSAGE_DRAFT";
    return null;
  }
}
