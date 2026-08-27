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

/** Parse a stored instant; date-only strings stay on the local calendar day. */
function parseInstant(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
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

/** YYYY-MM-DD from a timestamp, using the local calendar day. */
export function localDateInputFromInstant(value?: string | Date | null): string {
  const date = value ? parseInstant(value) : new Date();
  return localDateInputValue(date ?? new Date());
}

/** HH:mm for `<input type="time">`; defaults to now in local time. */
export function localTimeInputValue(value?: string | Date | null): string {
  const date = value ? parseInstant(value) : new Date();
  const source = date ?? new Date();
  const hours = String(source.getHours()).padStart(2, "0");
  const minutes = String(source.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Combine local date + time fields into an ISO timestamp. */
export function toLocalDateTimeIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  const instant = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours, minutes, seconds || 0, 0);
  if (Number.isNaN(instant.getTime())) return new Date().toISOString();
  return instant.toISOString();
}

export function formatDateAndTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parseInstant(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
