import { humanizeLabel } from "@nutrition-saas/ui";

export function roleLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "PLATFORM_ADMIN") return "Platform administrator";
  if (value === "SUPER_ADMIN") return "Super admin";
  if (value === "ADMIN") return "Admin";
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

export function statusLabel(value: string | null | undefined): string {
  return humanizeLabel(value) || "—";
}
