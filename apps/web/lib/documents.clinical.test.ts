import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertClinicalDocumentFile } from "./documents.ts";

describe("clinical document files", () => {
  it("allows pdf/word/txt and rejects images", () => {
    const pdf = new File(["%PDF"], "lab.pdf", { type: "application/pdf" });
    Object.defineProperty(pdf, "size", { value: 12 });
    assert.doesNotThrow(() => assertClinicalDocumentFile(pdf));

    const image = new File(["x"], "photo.png", { type: "image/png" });
    Object.defineProperty(image, "size", { value: 12 });
    assert.throws(() => assertClinicalDocumentFile(image), /PDF, Word, or TXT/);
  });
});
