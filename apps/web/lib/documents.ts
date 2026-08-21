/** Default matches API `MAX_DOCUMENT_BYTES` (20 MB). Override server-side via env. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_UPLOAD_HINT = "Max 20 MB · PDF, JPG, PNG, WebP, DOCX";

export const DOCUMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/png,image/jpeg,image/webp";

export function assertDocumentFileSize(file: File): void {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File exceeds the 20 MB limit");
  }
}

export function documentTypeLabel(mimeType: string | undefined, filename: string): string {
  const lower = filename.toLowerCase();
  if ((mimeType && mimeType.includes("pdf")) || lower.endsWith(".pdf")) return "PDF";
  if ((mimeType && mimeType.startsWith("image/")) || /\.(png|jpe?g|webp|gif)$/i.test(lower)) return "Image";
  if ((mimeType && mimeType.includes("word")) || lower.endsWith(".docx") || lower.endsWith(".doc")) return "DOC";
  return "File";
}

export function formatDocumentSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain?.[1]) {
    try {
      return decodeURIComponent(plain[1].trim());
    } catch {
      return plain[1].trim();
    }
  }
  return fallback;
}

async function errorMessageFromResponse(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    const message = data.message;
    if (Array.isArray(message) && message.length > 0) return message.join(", ");
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    /* ignore non-JSON bodies */
  }
  if (response.status === 404) return "Document not found";
  if (response.status === 413) return "File exceeds the 20 MB limit";
  return "Download failed";
}

/** Cookie-authenticated download via blob (avoids bare cross-origin anchor downloads). */
export async function downloadAuthenticatedFile(url: string, fallbackFilename = "download"): Promise<void> {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }
  const filename = filenameFromDisposition(response.headers.get("Content-Disposition"), fallbackFilename);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
