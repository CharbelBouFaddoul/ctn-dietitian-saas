import { humanizeLabel } from "@nutrition-saas/ui";

export function roleLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "PLATFORM_ADMIN" || value === "SUPER_ADMIN" || value === "ADMIN") return "Admin";
  return humanizeLabel(value);
}

export function auditActionLabel(value: string | null | undefined): string {
  return humanizeLabel(value) || "—";
}

export function featureLabel(value: string | null | undefined): string {
  return humanizeLabel(value) || "—";
}

export function healthStatusLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const normalized = value.toLowerCase();
  if (normalized === "ok" || normalized === "healthy" || normalized === "up" || normalized === "operational") {
    return "Operational";
  }
  if (normalized === "degraded" || normalized === "warn" || normalized === "warning") {
    return "Degraded";
  }
  if (normalized === "down" || normalized === "error" || normalized === "fail" || normalized === "failed") {
    return "Unavailable";
  }
  return humanizeLabel(value);
}

export function healthBadgeTone(
  label: string,
): "success" | "warning" | "danger" | "neutral" {
  if (label === "Operational") return "success";
  if (label === "Degraded") return "warning";
  if (label === "Unavailable") return "danger";
  return "neutral";
}

export function scopedStatusLabel(
  scope: "clinic" | "login" | "subscription" | "plan" | "patient",
  value: string | null | undefined,
): string {
  const status = statusLabel(value);
  if (scope === "clinic") return `Clinic · ${status}`;
  if (scope === "login") return `Login · ${status}`;
  if (scope === "subscription") return `Subscription · ${status}`;
  if (scope === "patient") return `Patient · ${status}`;
  return `Plan · ${status}`;
}

export function statusLabel(value: string | null | undefined): string {
  return humanizeLabel(value) || "—";
}
