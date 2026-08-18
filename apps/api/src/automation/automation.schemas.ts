import { z } from "@nutrition-saas/validation";
import type { AutomationActionType, AutomationTriggerType } from "@prisma/client";
import { AUTOMATION_RECIPIENTS, validateTemplateVariables } from "./automation-catalog";

const timingSchema = z.object({
  daysBefore: z.number().int().min(0).max(365).optional(),
  daysAfter: z.number().int().min(0).max(365).optional(),
  daysInactive: z.number().int().min(1).max(365).optional(),
  daysUntilEnd: z.number().int().min(1).max(365).optional(),
  intervalDays: z.number().int().min(1).max(365).optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const conditionsSchema = z.object({
  clientStatus: z.literal("ACTIVE").optional(),
  appointmentStatus: z.literal("SCHEDULED").optional(),
  invoiceStatus: z.literal("OVERDUE").optional(),
  taskStatus: z.enum(["TODO", "IN_PROGRESS"]).optional(),
});

const configurationSchema = z
  .object({
    timing: timingSchema.optional(),
    recipient: z.enum(AUTOMATION_RECIPIENTS),
    memberId: z.string().uuid().optional(),
    notificationTitle: z.string().min(1).max(200).optional(),
    notificationBody: z.string().min(1).max(5000).optional(),
    emailSubject: z.string().min(1).max(200).optional(),
    emailBody: z.string().min(1).max(10000).optional(),
    taskTitle: z.string().min(1).max(200).optional(),
    taskDescription: z.string().max(5000).optional(),
    taskPriority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  })
  .strict();

export type AutomationConfiguration = z.infer<typeof configurationSchema>;
export type AutomationConditions = z.infer<typeof conditionsSchema>;

export function parseAutomationConfiguration(input: unknown): AutomationConfiguration {
  return configurationSchema.parse(input);
}

export function parseAutomationConditions(input: unknown): AutomationConditions | null {
  if (input == null) return null;
  return conditionsSchema.parse(input);
}

export function validateRulePayload(input: {
  triggerType: AutomationTriggerType;
  actionType: AutomationActionType;
  configuration: unknown;
  conditions?: unknown;
}): { configuration: AutomationConfiguration; conditions: AutomationConditions | null } {
  const configuration = parseAutomationConfiguration(input.configuration);
  const conditions = parseAutomationConditions(input.conditions);

  if (configuration.recipient === "SPECIFIC_MEMBER" && !configuration.memberId) {
    throw new Error("memberId is required when recipient is SPECIFIC_MEMBER");
  }

  const templateFields = [
    configuration.notificationTitle,
    configuration.notificationBody,
    configuration.emailSubject,
    configuration.emailBody,
    configuration.taskTitle,
    configuration.taskDescription,
  ].filter(Boolean) as string[];

  for (const field of templateFields) {
    const unknown = validateTemplateVariables(field);
    if (unknown.length) {
      throw new Error(`Unknown template variables: ${unknown.join(", ")}`);
    }
  }

  validateTriggerActionPair(input.triggerType, input.actionType, configuration, conditions);

  return { configuration, conditions };
}

function validateTriggerActionPair(
  triggerType: AutomationTriggerType,
  actionType: AutomationActionType,
  configuration: AutomationConfiguration,
  conditions: AutomationConditions | null,
): void {
  switch (actionType) {
    case "SEND_IN_APP_NOTIFICATION":
      if (!configuration.notificationTitle || !configuration.notificationBody) {
        throw new Error("notificationTitle and notificationBody are required");
      }
      break;
    case "SEND_EMAIL":
      if (!configuration.emailSubject || !configuration.emailBody) {
        throw new Error("emailSubject and emailBody are required");
      }
      break;
    case "CREATE_TASK":
      if (!configuration.taskTitle) {
        throw new Error("taskTitle is required");
      }
      break;
    case "CREATE_CLIENT_NOTIFICATION":
      if (!configuration.notificationTitle || !configuration.notificationBody) {
        throw new Error("notificationTitle and notificationBody are required");
      }
      if (configuration.recipient !== "CLIENT") {
        throw new Error("CREATE_CLIENT_NOTIFICATION requires CLIENT recipient");
      }
      break;
  }

  switch (triggerType) {
    case "APPOINTMENT_UPCOMING":
      if (!configuration.timing?.daysBefore && configuration.timing?.daysBefore !== 0) {
        throw new Error("daysBefore is required for APPOINTMENT_UPCOMING");
      }
      if (conditions?.appointmentStatus && conditions.appointmentStatus !== "SCHEDULED") {
        throw new Error("Invalid appointment condition");
      }
      break;
    case "APPOINTMENT_MISSED":
      if (!configuration.timing?.daysAfter && configuration.timing?.daysAfter !== 0) {
        throw new Error("daysAfter is required for APPOINTMENT_MISSED");
      }
      break;
    case "CLIENT_INACTIVE":
      if (!configuration.timing?.daysInactive) {
        throw new Error("daysInactive is required for CLIENT_INACTIVE");
      }
      break;
    case "MEAL_PLAN_ENDING":
      if (!configuration.timing?.daysUntilEnd) {
        throw new Error("daysUntilEnd is required for MEAL_PLAN_ENDING");
      }
      break;
    case "CLIENT_CHECKIN_DUE":
      if (!configuration.timing?.intervalDays) {
        throw new Error("intervalDays is required for CLIENT_CHECKIN_DUE");
      }
      break;
    case "SCHEDULED_DATE_TIME":
      if (!configuration.timing?.localTime) {
        throw new Error("localTime is required for SCHEDULED_DATE_TIME");
      }
      break;
    case "INVOICE_OVERDUE":
    case "TASK_DUE":
      break;
  }
}
