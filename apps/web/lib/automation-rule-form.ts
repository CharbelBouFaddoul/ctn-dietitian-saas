import {
  automationActionLabel,
  automationRecipientLabel,
  automationTriggerLabel,
  defaultRecipientForAction,
  recipientModeForAction,
} from "./automation-labels";

export const CLIENT_NAME_TOKEN = "{{client.displayName}}";
export const CLIENT_NAME_FRIENDLY = "[Client_name]";

export type AutomationTemplateToken = {
  api: string;
  friendly: string;
  label: string;
  triggers?: string[];
};

export const AUTOMATION_TEMPLATE_TOKENS: AutomationTemplateToken[] = [
  { api: "client.displayName", friendly: "[Client_name]", label: "Client name" },
  { api: "client.firstName", friendly: "[Client_first_name]", label: "First name" },
  { api: "client.lastName", friendly: "[Client_last_name]", label: "Last name" },
  { api: "dietitian.name", friendly: "[Dietitian_name]", label: "Dietitian name" },
  { api: "organization.name", friendly: "[Clinic_name]", label: "Clinic name" },
  { api: "run.date", friendly: "[Today]", label: "Today’s date" },
  { api: "appointment.date", friendly: "[Appointment_date]", label: "Appointment date", triggers: ["APPOINTMENT_UPCOMING", "APPOINTMENT_MISSED"] },
  { api: "appointment.time", friendly: "[Appointment_time]", label: "Appointment time", triggers: ["APPOINTMENT_UPCOMING", "APPOINTMENT_MISSED"] },
  { api: "appointment.title", friendly: "[Appointment_title]", label: "Appointment title", triggers: ["APPOINTMENT_UPCOMING", "APPOINTMENT_MISSED"] },
  { api: "invoice.number", friendly: "[Invoice_number]", label: "Invoice number", triggers: ["INVOICE_OVERDUE"] },
  { api: "invoice.amount", friendly: "[Invoice_amount]", label: "Invoice amount", triggers: ["INVOICE_OVERDUE"] },
  { api: "invoice.dueDate", friendly: "[Invoice_due_date]", label: "Invoice due date", triggers: ["INVOICE_OVERDUE"] },
  { api: "mealPlan.name", friendly: "[Meal_plan_name]", label: "Meal plan name", triggers: ["MEAL_PLAN_ENDING"] },
  { api: "mealPlan.endDate", friendly: "[Meal_plan_end_date]", label: "Meal plan end date", triggers: ["MEAL_PLAN_ENDING"] },
  { api: "mealPlan.lastUpdateDate", friendly: "[Meal_plan_last_update_date]", label: "Meal plan last update", triggers: ["MEAL_PLAN_ENDING"] },
  { api: "task.title", friendly: "[Task_title]", label: "Task title", triggers: ["TASK_DUE"] },
  { api: "task.dueDate", friendly: "[Task_due_date]", label: "Task due date", triggers: ["TASK_DUE"] },
  { api: "client.lastActivityDate", friendly: "[Last_activity_date]", label: "Last activity date", triggers: ["CLIENT_INACTIVE"] },
];

export function tokensForTrigger(triggerType: string): AutomationTemplateToken[] {
  return AUTOMATION_TEMPLATE_TOKENS.filter((token) => !token.triggers || token.triggers.includes(triggerType));
}

export function toFriendlyTemplate(value: string): string {
  let next = value.split("[Client name]").join(CLIENT_NAME_FRIENDLY);
  for (const token of AUTOMATION_TEMPLATE_TOKENS) {
    next = next.split(`{{${token.api}}}`).join(token.friendly);
  }
  return next;
}

export function toApiTemplate(value: string): string {
  let next = value.split("[Client name]").join(CLIENT_NAME_FRIENDLY);
  for (const token of AUTOMATION_TEMPLATE_TOKENS) {
    next = next.split(token.friendly).join(`{{${token.api}}}`);
  }
  return next;
}

export type AutomationRecipientChoice = "ASSIGNED_DIETITIAN" | "CLIENT" | "BOTH";
export type ClientScope = "ALL" | "SELECTED";

export type AutomationRuleConfiguration = {
  recipient?: string;
  timing?: Record<string, number>;
  clientScope?: string;
  clientIds?: string[];
  taskTitle?: string;
  taskPriority?: string;
  notificationTitle?: string;
  notificationBody?: string;
  emailSubject?: string;
  emailBody?: string;
  messageBody?: string;
};

export type AutomationRuleRecord = {
  id: string;
  name: string;
  status: string;
  triggerType: string;
  actionType: string;
  summary: string;
  lastRunAt: string | null;
  configuration?: AutomationRuleConfiguration;
};

export type AutomationClientOption = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
};

export type AutomationUsageSummary = {
  enabled: boolean;
  productEmailEnabled: boolean;
  ruleLimit: number | null;
  activeRules: number;
  rulesRemaining: number | null;
  executionLimit: number | null;
  executionCount: number;
  executionsRemaining: number | null;
};

export const AUTOMATION_TRIGGERS = [
  { value: "APPOINTMENT_UPCOMING", label: "Appointment is approaching", timingKey: "daysBefore", timingDefault: 1, timingLabel: "Days before" },
  { value: "APPOINTMENT_MISSED", label: "Appointment was missed", timingKey: "daysAfter", timingDefault: 1, timingLabel: "Days after" },
  { value: "CLIENT_INACTIVE", label: "Client has no recent activity", timingKey: "daysInactive", timingDefault: 3, timingLabel: "Days without activity" },
  { value: "INVOICE_OVERDUE", label: "Invoice is overdue", timingKey: null, timingDefault: null, timingLabel: null },
  { value: "TASK_DUE", label: "Task is due today", timingKey: null, timingDefault: null, timingLabel: null },
  { value: "MEAL_PLAN_ENDING", label: "Meal plan is ending soon", timingKey: "daysUntilEnd", timingDefault: 3, timingLabel: "Days until end" },
  { value: "CLIENT_CHECKIN_DUE", label: "Client check-in is due", timingKey: "intervalDays", timingDefault: 7, timingLabel: "Every how many days?" },
] as const;

export const AUTOMATION_ACTIONS = [
  {
    value: "SEND_IN_APP_NOTIFICATION",
    label: "Send notification",
    hint: "Bell notification in the clinic, the client portal, or both.",
  },
  { value: "SEND_EMAIL", label: "Send email", hint: "Email subject and body to you or the client." },
  { value: "CREATE_TASK", label: "Create follow-up task", hint: "Adds a task on your clinic Tasks list." },
  {
    value: "SEND_MESSAGE",
    label: "Send message",
    hint: "Posts in the Messages thread with this client.",
  },
] as const;

export function clientLabel(client: AutomationClientOption): string {
  return client.displayName?.trim() || `${client.firstName} ${client.lastName}`;
}

export function humanRuleSummary(rule: {
  triggerType: string;
  actionType: string;
  configuration?: AutomationRuleConfiguration;
}): string {
  const scope =
    rule.configuration?.clientScope === "SELECTED" && rule.configuration.clientIds?.length
      ? ` · ${rule.configuration.clientIds.length} client${rule.configuration.clientIds.length === 1 ? "" : "s"}`
      : " · all clients";
  return `When ${automationTriggerLabel(rule.triggerType).toLowerCase()} → ${automationActionLabel(rule.actionType).toLowerCase()}${scope}`;
}

export function previewRuleSummary(input: {
  triggerType: string;
  actionType: string;
  recipient: AutomationRecipientChoice;
  clientScope: ClientScope;
  selectedClientIds: string[];
}): string {
  const whoMode = recipientModeForAction(input.actionType);
  const whoLabel =
    whoMode === "hidden" ? "clinic tasks" : automationRecipientLabel(input.recipient).toLowerCase();
  const scopeLabel =
    input.clientScope === "SELECTED"
      ? `${input.selectedClientIds.length} client${input.selectedClientIds.length === 1 ? "" : "s"}`
      : "all clients";
  return `When ${automationTriggerLabel(input.triggerType).toLowerCase()} → ${automationActionLabel(input.actionType).toLowerCase()}${
    whoMode === "hidden" ? "" : ` → ${whoLabel}`
  } · ${scopeLabel}`;
}

export function triggerMeta(triggerType: string) {
  return AUTOMATION_TRIGGERS.find((row) => row.value === triggerType) ?? AUTOMATION_TRIGGERS[2];
}

export function timingFromConfiguration(triggerType: string, configuration?: AutomationRuleConfiguration): number {
  const meta = triggerMeta(triggerType);
  if (!meta.timingKey) return meta.timingDefault ?? 1;
  const stored = configuration?.timing?.[meta.timingKey];
  return typeof stored === "number" ? stored : meta.timingDefault ?? 1;
}

export function buildAutomationConfiguration(input: {
  triggerType: string;
  actionType: string;
  timingValue: number;
  recipient: AutomationRecipientChoice;
  clientScope: ClientScope;
  selectedClientIds: string[];
  taskTitle: string;
  notificationTitle: string;
  notificationBody: string;
}): Record<string, unknown> {
  const meta = triggerMeta(input.triggerType);
  const whoMode = recipientModeForAction(input.actionType);
  const recipient =
    whoMode === "locked-client" ? "CLIENT" : whoMode === "hidden" ? "ASSIGNED_DIETITIAN" : input.recipient;
  const timing: Record<string, number> = {};
  if (meta.timingKey) timing[meta.timingKey] = input.timingValue;

  const configuration: Record<string, unknown> = {
    recipient,
    timing: Object.keys(timing).length ? timing : undefined,
    clientScope: input.clientScope,
    clientIds: input.clientScope === "SELECTED" ? input.selectedClientIds : undefined,
  };
  if (input.actionType === "CREATE_TASK") {
    configuration.taskTitle = toApiTemplate(input.taskTitle);
    configuration.taskPriority = "HIGH";
  }
  if (input.actionType === "SEND_IN_APP_NOTIFICATION" || input.actionType === "CREATE_CLIENT_NOTIFICATION") {
    configuration.notificationTitle = toApiTemplate(input.notificationTitle);
    configuration.notificationBody = toApiTemplate(input.notificationBody);
  }
  if (input.actionType === "SEND_EMAIL") {
    configuration.emailSubject = toApiTemplate(input.notificationTitle);
    configuration.emailBody = toApiTemplate(input.notificationBody);
  }
  if (input.actionType === "SEND_MESSAGE") {
    configuration.messageBody = toApiTemplate(input.notificationBody);
  }
  return configuration;
}

export function defaultActionCopy(actionType: string): {
  taskTitle: string;
  notificationTitle: string;
  notificationBody: string;
} {
  return {
    taskTitle: `Follow up with ${CLIENT_NAME_FRIENDLY}`,
    notificationTitle: "Automation reminder",
    notificationBody:
      actionType === "SEND_MESSAGE"
        ? `Hi ${CLIENT_NAME_FRIENDLY}, this is a reminder from your dietitian.`
        : `Review ${CLIENT_NAME_FRIENDLY} — generated by automation.`,
  };
}

export function hydrateRuleForm(rule: AutomationRuleRecord) {
  const config = rule.configuration ?? {};
  const recipientRaw = config.recipient;
  const recipient: AutomationRecipientChoice =
    recipientRaw === "CLIENT" || recipientRaw === "BOTH" || recipientRaw === "ASSIGNED_DIETITIAN"
      ? recipientRaw
      : defaultRecipientForAction(rule.actionType);
  const copy = defaultActionCopy(rule.actionType);
  return {
    name: rule.name,
    triggerType: rule.triggerType,
    actionType: rule.actionType,
    timingValue: timingFromConfiguration(rule.triggerType, config),
    recipient,
    clientScope: (config.clientScope === "SELECTED" ? "SELECTED" : "ALL") as ClientScope,
    selectedClientIds: config.clientIds ?? [],
    taskTitle: toFriendlyTemplate(config.taskTitle ?? copy.taskTitle),
    notificationTitle: toFriendlyTemplate(config.notificationTitle ?? config.emailSubject ?? copy.notificationTitle),
    notificationBody: toFriendlyTemplate(
      config.notificationBody ?? config.emailBody ?? config.messageBody ?? copy.notificationBody,
    ),
  };
}
