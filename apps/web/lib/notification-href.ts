export type NotificationNavMode =
  | { kind: "practice"; dietitianAccountId: string }
  | { kind: "portal" };

export interface NotificationNavItem {
  type: string;
  targetType?: string | null;
  targetId?: string | null;
  clientId?: string | null;
}

/**
 * Resolve an in-app path for a notification. Returns null when there is no useful target.
 */
export function hrefForNotification(
  mode: NotificationNavMode,
  item: NotificationNavItem,
): string | null {
  const targetType = item.targetType ?? null;
  const clientId = item.clientId ?? (targetType === "client" ? item.targetId : null);

  if (mode.kind === "portal") {
    switch (targetType) {
      case "conversation":
      case "message":
        return "/client/messages";
      case "appointment":
        return item.targetId
          ? `/client/appointments?appointmentId=${item.targetId}`
          : "/client/appointments";
      case "document":
        return "/client/documents";
      case "invoice":
        return "/client/invoices";
      case "meal_plan":
      case "meal_plan_version":
        return "/client/plan";
      default:
        if (item.type === "MEAL_PLAN_PUBLISHED") return "/client/plan";
        if (item.type === "NEW_MESSAGE") return "/client/messages";
        if (item.type.startsWith("APPOINTMENT_")) return "/client/appointments";
        if (item.type === "INVOICE_SENT") return "/client/invoices";
        if (item.type === "DOCUMENT_SHARED") return "/client/documents";
        return "/client/notifications";
    }
  }

  const base = `/practice/${mode.dietitianAccountId}`;
  switch (targetType) {
    case "conversation":
    case "message":
      return clientId ? `${base}/messages?clientId=${clientId}` : `${base}/messages`;
    case "appointment":
      return item.targetId
        ? `${base}/calendar?appointmentId=${item.targetId}`
        : `${base}/calendar`;
    case "client":
      return clientId ? `${base}/clients/${clientId}` : `${base}/clients`;
    case "document":
      return clientId ? `${base}/clients/${clientId}?tab=clinical` : `${base}/clients`;
    case "invoice":
      return `${base}/invoices`;
    case "task":
      return `${base}/tasks`;
    case "meal_plan":
    case "meal_plan_version":
      return clientId
        ? `${base}/clients/${clientId}?tab=meal-plan${item.targetId ? `&planId=${item.targetId}` : ""}`
        : item.targetId
          ? `${base}/meal-plans/${item.targetId}`
          : `${base}/meal-plans`;
    case "subscription":
      return base;
    default:
      if (item.type === "NEW_MESSAGE") {
        return clientId ? `${base}/messages?clientId=${clientId}` : `${base}/messages`;
      }
      if (item.type === "CLIENT_JOINED" && clientId) return `${base}/clients/${clientId}`;
      if (item.type === "DISCONNECT_REQUESTED" && clientId) {
        return `${base}/clients/${clientId}?tab=portal`;
      }
      if (item.type === "TASK_ASSIGNED") return `${base}/tasks`;
      if (item.type.startsWith("APPOINTMENT_")) return `${base}/calendar`;
      if (item.type.startsWith("SUBSCRIPTION_")) return base;
      return `${base}/notifications`;
  }
}
