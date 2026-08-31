export const PORTAL_FORMS_CHANGED = "portal-forms-changed";

export function announcePortalFormsChanged(count?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PORTAL_FORMS_CHANGED, { detail: { count } }));
}

export function pendingFormsFromAssessments(rows: Array<{ status: string }>) {
  return rows.filter((row) => row.status === "DRAFT" || row.status === "IN_PROGRESS").length;
}
