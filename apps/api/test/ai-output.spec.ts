import { describe, expect, it } from "vitest";
import { clientSummaryOutputSchema, parseAiJson } from "../src/ai/ai-output.schemas";

describe("AI output schemas", () => {
  it("accepts valid client summary JSON", () => {
    const parsed = parseAiJson(clientSummaryOutputSchema, JSON.stringify({
      overview: "Stable progress",
      observations: ["Consistent logging"],
      adherence: ["Meal plan active"],
      areas_to_review: ["Weekend habits"],
      suggested_questions: ["What helps weekdays?"],
    }));
    expect(parsed.overview).toBe("Stable progress");
  });

  it("rejects malformed structured output", () => {
    expect(() => parseAiJson(clientSummaryOutputSchema, JSON.stringify({ overview: 123 }))).toThrow();
  });
});
