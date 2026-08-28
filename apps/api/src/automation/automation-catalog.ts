import type { AutomationActionType, AutomationTriggerType } from "@prisma/client";

export const AUTOMATION_RECIPIENTS = [
  "ASSIGNED_DIETITIAN",
  "CLIENT",
  "BOTH",
  "RULE_CREATOR",
  "SPECIFIC_MEMBER",
] as const;

export type AutomationRecipient = (typeof AUTOMATION_RECIPIENTS)[number];

export const TEMPLATE_VARIABLES = [
  "client.firstName",
  "client.lastName",
  "client.displayName",
  "client.lastActivityDate",
  "dietitian.name",
  "appointment.date",
  "appointment.time",
  "appointment.title",
  "organization.name",
  "invoice.number",
  "invoice.amount",
  "invoice.dueDate",
  "task.title",
  "task.dueDate",
  "mealPlan.name",
  "mealPlan.endDate",
  "mealPlan.lastUpdateDate",
  "rule.name",
  "run.date",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  APPOINTMENT_UPCOMING: "Appointment is approaching",
  APPOINTMENT_MISSED: "Appointment was missed",
  CLIENT_INACTIVE: "Client has no recent activity",
  MEAL_PLAN_ENDING: "Meal plan is ending soon",
  INVOICE_OVERDUE: "Invoice is overdue",
  TASK_DUE: "Task is due",
  CLIENT_CHECKIN_DUE: "Client check-in is due",
  SCHEDULED_DATE_TIME: "Scheduled date/time",
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  SEND_IN_APP_NOTIFICATION: "Send notification",
  SEND_EMAIL: "Send email",
  CREATE_TASK: "Create follow-up task",
  CREATE_CLIENT_NOTIFICATION: "Send notification",
  SEND_MESSAGE: "Send message",
};

export const RECIPIENT_LABELS: Record<AutomationRecipient, string> = {
  ASSIGNED_DIETITIAN: "You (clinic)",
  CLIENT: "Client (portal)",
  BOTH: "Clinic and client",
  RULE_CREATOR: "Rule creator",
  SPECIFIC_MEMBER: "Specific member",
};

export const TEMPLATE_VAR_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

export function extractTemplateVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TEMPLATE_VAR_PATTERN)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function validateTemplateVariables(text: string): string[] {
  const unknown: string[] = [];
  for (const variable of extractTemplateVariables(text)) {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(variable)) {
      unknown.push(variable);
    }
  }
  return unknown;
}
