const SPECIAL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  OWNER: "Owner",
  DIETITIAN: "Dietitian",
  STAFF: "Staff",
  BOOLEAN: "On / off",
  LIMIT: "Limit",
  CUSTOM: "Practice food",
  GLOBAL: "Catalog food",
  fl_oz: "fl oz",
  g: "g",
  ml: "ml",
  oz: "oz",
  cup: "cup",
  tbsp: "tbsp",
  tsp: "tsp",
  OPEN: "Open",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  PAID: "Paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  SENT: "Sent",
  ISSUED: "Issued",
  VOID: "Void",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PAUSED: "Paused",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  FOOD_LOG: "Food log",
  WATER_LOG: "Water log",
  EXERCISE_LOG: "Exercise log",
  SLEEP_LOG: "Sleep log",
  HABIT_LOG: "Habit",
  CLIENT_UPDATED: "Client profile was updated",
  CLIENT_CREATED: "Client was added",
  MEAL_PLAN_CREATED: "Meal plan was created",
  MEAL_PLAN_PUBLISHED: "Meal plan was published",
  MEAL_PLAN_UPDATED: "Meal plan was updated",
  ASSESSMENT_COMPLETED: "Assessment was completed",
  ASSESSMENT_CREATED: "Assessment was created",
  APPOINTMENT_CREATED: "Appointment was scheduled",
  APPOINTMENT_UPDATED: "Appointment was updated",
  INVOICE_CREATED: "Invoice was created",
  INVOICE_PAID: "Invoice was marked paid",
  DOCUMENT_UPLOADED: "Document was uploaded",
  MESSAGE_SENT: "Message was sent",
  TASK_CREATED: "Task was created",
  TASK_COMPLETED: "Task was completed",
  APPOINTMENT_UPCOMING: "Appointment is approaching",
  CLIENT_INACTIVE: "Client has no recent activity",
  INVOICE_OVERDUE: "Invoice is overdue",
  TASK_DUE: "Task is due today",
  MEAL_PLAN_ENDING: "Meal plan is ending soon",
  CLIENT_CHECKIN_DUE: "Client check-in is due",
  CLIENT_MEAL_PLAN_UPDATED: "Client meal plan was updated",
  FOOD_LOG_CREATED: "Client tracking completed",
  SEND_IN_APP_NOTIFICATION: "Send in-app notification",
  SEND_EMAIL: "Send email",
  CREATE_TASK: "Create follow-up task",
  CREATE_CLIENT_NOTIFICATION: "Notify client",
  ASSIGNED_DIETITIAN: "Assigned dietitian",
  ORGANIZATION_OWNER: "Practice owner",
  ALL_DIETITIANS: "All dietitians",
  CLIENT: "Client",
  this_week: "This week",
  this_month: "This month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  due_today: "Due today",
  overdue: "Overdue",
  organization_inactive: "Practice is inactive",
  entitlement_denied: "This feature is not available on the current plan",
  execution_limit: "Automation run limit reached",
};

export function humanizeLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (SPECIAL[value]) return SPECIAL[value];
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const BUTTON_CLASS: Record<string, string> = {
  primary: "ui-btn ui-btn--primary",
  secondary: "ui-btn ui-btn--secondary",
  ghost: "ui-btn ui-btn--ghost",
  danger: "ui-btn ui-btn--danger",
};

export function buttonClassName(
  variant: keyof typeof BUTTON_CLASS = "primary",
  size: "md" | "sm" | "lg" = "md",
  block = false,
): string {
  return [
    BUTTON_CLASS[variant] ?? BUTTON_CLASS.primary,
    size === "sm" ? "ui-btn--sm" : "",
    size === "lg" ? "ui-btn--lg" : "",
    block ? "ui-btn--block" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
