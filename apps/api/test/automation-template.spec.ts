import { describe, expect, it } from "vitest";
import { validateTemplateVariables } from "../src/automation/automation-catalog";

describe("automation template validation", () => {
  it("accepts known variables", () => {
    expect(validateTemplateVariables("Hello {{client.firstName}} from {{organization.name}}")).toEqual([]);
  });

  it("rejects unknown variables", () => {
    expect(validateTemplateVariables("Bad {{client.password}} and {{database.secret}}")).toEqual([
      "client.password",
      "database.secret",
    ]);
  });
});
