export function formatMoney(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

/** Parse calendar dates without UTC-midnight shifting YYYY-MM-DD strings. */
function parseCalendarDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parseCalendarDate(value);
  if (!date) return "—";
  return date.toLocaleDateString();
}

/** YYYY-MM-DD for `<input type="date">`; defaults to today in local time. */
export function localDateInputValue(value?: string | Date | null): string {
  const date = value ? parseCalendarDate(value) : new Date();
  const source = date ?? new Date();
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Full calendar date for demographics (e.g. "May 15, 1990"). */
export function formatFullDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parseCalendarDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Whole years completed since date of birth; null when missing/invalid. */
export function ageInYears(dateOfBirth: string | Date | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = parseCalendarDate(dateOfBirth);
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age < 0 ? null : age;
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
