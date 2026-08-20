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
  FOOD_LOG: "Food log",
  WATER_LOG: "Water log",
  EXERCISE_LOG: "Exercise log",
  SLEEP_LOG: "Sleep log",
  HABIT_LOG: "Habit",
  APPOINTMENT_UPCOMING: "Appointment is approaching",
  CLIENT_INACTIVE: "Client has no recent activity",
  INVOICE_OVERDUE: "Invoice is overdue",
  TASK_DUE: "Task is due today",
  MEAL_PLAN_ENDING: "Meal plan is ending soon",
  CLIENT_CHECKIN_DUE: "Client check-in is due",
  SEND_IN_APP_NOTIFICATION: "Send in-app notification",
  SEND_EMAIL: "Send email",
  CREATE_TASK: "Create follow-up task",
  CREATE_CLIENT_NOTIFICATION: "Notify client",
  ASSIGNED_DIETITIAN: "Assigned dietitian",
  this_week: "This week",
  this_month: "This month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
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
