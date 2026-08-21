/** Practice-facing status / portal labels — never show raw enums or IDs. */

import { humanizeLabel } from "@nutrition-saas/ui";
import { connectionStatusLabel } from "./connection-status";

const PORTAL_STATUS: Record<string, string> = {
  connected: "Portal active",
  CONNECTED: "Portal active",
  ACTIVE: "Portal active",
  waiting: "Waiting for client",
  WAITING: "Waiting for client",
  PENDING: "Waiting for client",
  INVITED: "Waiting for client",
  not_connected: "Portal not activated",
  NOT_CONNECTED: "Portal not activated",
  DISCONNECTED: "Portal not activated",
  NONE: "Portal not activated",
  expired: "Join code expired",
  EXPIRED: "Join code expired",
  deactivated: "Portal access deactivated",
  DEACTIVATED: "Portal access deactivated",
  ARCHIVED: "Portal access deactivated",
  INACTIVE: "Portal access deactivated",
};

/** Prefer `connectionStatusLabel` for derived connectionStatus; this also accepts raw ClientAccount.status. */
export function portalStatusLabel(value: string | null | undefined): string {
  if (!value) return connectionStatusLabel(null);
  return PORTAL_STATUS[value] ?? connectionStatusLabel(value);
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
