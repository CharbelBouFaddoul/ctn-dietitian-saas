const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: "application/msword", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 200) || "file";
}

export function extensionFromFilename(name: string): string {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(name);
  return match?.[1]?.toLowerCase() ?? "bin";
}

export function detectMime(buffer: Buffer): string | null {
  for (const rule of MAGIC) {
    const offset = rule.offset ?? 0;
    if (buffer.length < offset + rule.bytes.length) continue;
    const slice = buffer.subarray(offset, offset + rule.bytes.length);
    if (rule.bytes.every((byte, index) => slice[index] === byte)) {
      return rule.mime;
    }
  }
  return null;
}

export function isLikelyPlainText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) return false;
  let control = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / sample.length < 0.05;
}

function normalizeDeclaredMime(declaredMime: string): string {
  return declaredMime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function assertAllowedUpload(
  detectedMime: string | null,
  declaredMime: string,
  filename: string,
  buffer: Buffer,
): string {
  const ext = extensionFromFilename(filename);
  const declared = normalizeDeclaredMime(declaredMime);

  if (ext === "txt") {
    if (!isLikelyPlainText(buffer)) {
      throw new Error("Unsupported file type");
    }
    if (declared && declared !== "text/plain" && declared !== "application/octet-stream") {
      throw new Error("Unsupported declared MIME type");
    }
    return "text/plain";
  }

  if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
    throw new Error("Unsupported file type");
  }
  if (declared && declared !== "application/octet-stream" && !ALLOWED_MIME_TYPES.has(declared)) {
    throw new Error("Unsupported declared MIME type");
  }
  if (
    declared &&
    declared !== "application/octet-stream" &&
    detectedMime !== declared &&
    !(detectedMime.startsWith("image/") && declared.startsWith("image/"))
  ) {
    throw new Error("MIME type mismatch");
  }
  if (detectedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && ext !== "docx") {
    throw new Error("Unsupported file type");
  }
  if (detectedMime === "application/msword" && ext !== "doc") {
    throw new Error("Unsupported file type");
  }
  return detectedMime;
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
}
