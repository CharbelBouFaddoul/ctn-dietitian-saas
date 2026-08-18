const SENSITIVE_KEY =
  /^(password|token|secret|hash|cookie|authorization|rawtoken|passwordhash|accesstoken|refreshtoken|sessiontoken)$/i;

export function sanitizeAuditMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeValue(value, 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 6 || value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        continue;
      }
      const next = sanitizeValue(nested, depth + 1);
      if (next !== undefined) {
        output[key] = next;
      }
    }
    return output;
  }
  return String(value);
}
