import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAppearancePreference, resolveAppearance } from "./appearance.ts";

describe("appearance", () => {
  it("parses stored preferences and falls back to system", () => {
    assert.equal(parseAppearancePreference("light"), "light");
    assert.equal(parseAppearancePreference("dark"), "dark");
    assert.equal(parseAppearancePreference("system"), "system");
    assert.equal(parseAppearancePreference("nope"), "system");
    assert.equal(parseAppearancePreference(null), "system");
  });

  it("resolves explicit light and dark without using the OS", () => {
    assert.equal(resolveAppearance("light"), "light");
    assert.equal(resolveAppearance("dark"), "dark");
  });
});
