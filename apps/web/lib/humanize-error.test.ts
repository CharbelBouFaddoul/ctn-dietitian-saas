import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorMessage, humanizeApiMessage } from "./humanize-error.ts";

describe("humanize-error", () => {
  it("maps known API copy", () => {
    assert.equal(humanizeApiMessage("Authentication required"), "Sign in to continue.");
  });

  it("hides internal 500-style messages", () => {
    assert.equal(humanizeApiMessage("Internal server error"), "Something went wrong. Please try again.");
    const err = Object.assign(new Error("boom"), { status: 500 });
    assert.equal(errorMessage(err), "Something went wrong. Please try again.");
  });
});
