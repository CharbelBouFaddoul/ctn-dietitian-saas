export function assertNever(value: never, message = "Unexpected value"): never {
  throw new Error(`${message}: ${String(value)}`);
}

/** Canonical email for login, uniqueness, reset, and verification. */
export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFC").toLowerCase();
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "org";
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** BCP 47 language tag, e.g. en, en-US, en-LB, fr-LB, ar-LB. */
export function isValidLocale(locale: string): boolean {
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale);
}

export { dayBoundsUtc, localDateKey, parseLocalDate } from "./timezone";
