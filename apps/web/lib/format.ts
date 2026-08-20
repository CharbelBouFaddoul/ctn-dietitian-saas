export function formatMoney(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export function nutritionLabel(value: number | null | undefined, suffix: string): string {
  if (value === null || value === undefined) return "—";
  return `${value} ${suffix}`;
}

export function statusTone(status: string | null | undefined): "accent" | "neutral" | "danger" | "success" | "warning" {
  const value = (status ?? "").toUpperCase();
  if (["ACTIVE", "PAID", "CONNECTED", "COMPLETED", "PUBLISHED", "OK"].includes(value)) return "success";
  if (["OVERDUE", "FAILED", "ARCHIVED", "CANCELLED", "DEACTIVATED"].includes(value)) return "danger";
  if (["PENDING", "DRAFT", "WAITING", "PAUSED", "ISSUED"].includes(value)) return "warning";
  return "neutral";
}
