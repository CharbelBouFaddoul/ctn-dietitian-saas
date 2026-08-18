import { z } from "@nutrition-saas/validation";

export const clientSummaryOutputSchema = z.object({
  overview: z.string(),
  observations: z.array(z.string()),
  adherence: z.array(z.string()),
  areas_to_review: z.array(z.string()),
  suggested_questions: z.array(z.string()),
});

export const mealPlanAssistanceOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      meal: z.string(),
      notes: z.string().optional(),
    }),
  ),
  substitutions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      reason: z.string().optional(),
    }),
  ),
  notes: z.array(z.string()),
});

export const nutritionAssistanceOutputSchema = z.object({
  explanation: z.string(),
  talking_points: z.array(z.string()),
  notes: z.array(z.string()),
});

export const consultationSummaryOutputSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
  follow_up_questions: z.array(z.string()),
  action_items: z.array(z.string()),
});

export const messageDraftOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type ClientSummaryOutput = z.infer<typeof clientSummaryOutputSchema>;
export type MealPlanAssistanceOutput = z.infer<typeof mealPlanAssistanceOutputSchema>;
export type NutritionAssistanceOutput = z.infer<typeof nutritionAssistanceOutputSchema>;
export type ConsultationSummaryOutput = z.infer<typeof consultationSummaryOutputSchema>;
export type MessageDraftOutput = z.infer<typeof messageDraftOutputSchema>;

export function parseAiJson<T>(schema: z.ZodSchema<T>, raw: string): T {
  const parsed = JSON.parse(raw) as unknown;
  return schema.parse(parsed);
}
