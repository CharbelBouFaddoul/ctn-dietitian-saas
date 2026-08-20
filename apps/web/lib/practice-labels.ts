/** Practice-facing status / portal labels — never show raw enums or IDs. */

import { humanizeLabel } from "@nutrition-saas/ui";

const PORTAL_STATUS: Record<string, string> = {
  CONNECTED: "Portal connected",
  ACTIVE: "Portal connected",
  WAITING: "Waiting for client",
  PENDING: "Waiting for client",
  INVITED: "Waiting for client",
  NOT_CONNECTED: "Not connected",
  DISCONNECTED: "Not connected",
  NONE: "Not connected",
  EXPIRED: "Join code expired",
  DEACTIVATED: "Deactivated",
  ARCHIVED: "Deactivated",
  INACTIVE: "Deactivated",
};

export function portalStatusLabel(value: string | null | undefined): string {
  if (!value) return "Not connected";
  return PORTAL_STATUS[value] ?? humanizeLabel(value);
}

export function statusLabel(value: string | null | undefined): string {
  return humanizeLabel(value);
}

export function unitLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "fl_oz") return "fl oz";
  return humanizeLabel(value).toLowerCase();
}

export function activityLabel(type: string | null | undefined, fallback?: string): string {
  if (!type) return fallback ?? "Activity";
  return humanizeLabel(type) || fallback || "Activity";
}
