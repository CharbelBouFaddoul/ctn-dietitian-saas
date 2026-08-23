/** Shared human labels for practice automation screens. */
export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = {
  APPOINTMENT_UPCOMING: "Appointment is approaching",
  APPOINTMENT_MISSED: "Appointment was missed",
  CLIENT_INACTIVE: "Client has no recent activity",
  MEAL_PLAN_ENDING: "Meal plan is ending soon",
  INVOICE_OVERDUE: "Invoice is overdue",
  TASK_DUE: "Task is due today",
  CLIENT_CHECKIN_DUE: "Client check-in is due",
  SCHEDULED_DATE_TIME: "Scheduled date/time",
};

export const AUTOMATION_ACTION_LABELS: Record<string, string> = {
  SEND_IN_APP_NOTIFICATION: "Send notification",
  SEND_EMAIL: "Send email",
  CREATE_TASK: "Create follow-up task",
  CREATE_CLIENT_NOTIFICATION: "Send notification",
  SEND_MESSAGE: "Send message",
};

export const AUTOMATION_RECIPIENT_LABELS: Record<string, string> = {
  ASSIGNED_DIETITIAN: "You (clinic)",
  CLIENT: "Client (portal)",
  BOTH: "Clinic and client",
  RULE_CREATOR: "Rule creator",
  SPECIFIC_MEMBER: "Specific member",
};

export function automationTriggerLabel(value: string): string {
  return AUTOMATION_TRIGGER_LABELS[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function automationActionLabel(value: string): string {
  return AUTOMATION_ACTION_LABELS[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function automationRecipientLabel(value: string): string {
  return AUTOMATION_RECIPIENT_LABELS[value] ?? value.replaceAll("_", " ").toLowerCase();
}

/** Who the rule targets — forced for some actions. */
export function recipientModeForAction(actionType: string): "hidden" | "locked-client" | "choose" {
  if (actionType === "CREATE_TASK") return "hidden";
  if (actionType === "CREATE_CLIENT_NOTIFICATION" || actionType === "SEND_MESSAGE") return "locked-client";
  return "choose";
}

export function defaultRecipientForAction(actionType: string): "ASSIGNED_DIETITIAN" | "CLIENT" | "BOTH" {
  const mode = recipientModeForAction(actionType);
  if (mode === "locked-client") return "CLIENT";
  return "ASSIGNED_DIETITIAN";
}
