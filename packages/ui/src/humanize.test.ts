import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUTTON_CLASS, buttonClassName, humanizeLabel } from "./humanize.ts";

describe("humanizeLabel", () => {
  it("maps known enums to product copy", () => {
    assert.equal(humanizeLabel("CLIENT_INACTIVE"), "Client has no recent activity");
    assert.equal(humanizeLabel("SUPER_ADMIN"), "Super admin");
    assert.equal(humanizeLabel("this_month"), "This month");
  });

  it("title-cases unknown snake_case values", () => {
    assert.equal(humanizeLabel("meal_check_in"), "Meal Check In");
    assert.equal(humanizeLabel("DRAFT"), "Draft");
  });
});

describe("buttonClassName", () => {
  it("builds variant classes used by Button", () => {
    assert.equal(BUTTON_CLASS.primary, "ui-btn ui-btn--primary");
    assert.ok(buttonClassName("danger", "sm").includes("ui-btn--danger"));
    assert.ok(buttonClassName("primary", "md", true).includes("ui-btn--block"));
  });
});
