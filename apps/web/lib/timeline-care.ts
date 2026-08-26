/** Care / tracking timeline events shown on the client Tracking tab. */
export const CARE_TIMELINE_TYPES = [
  "MEASUREMENT_ADDED",
  "FOOD_LOGGED",
  "WATER_LOGGED",
  "EXERCISE_LOGGED",
  "SLEEP_LOGGED",
  "HABIT_COMPLETED",
  "GOAL_CREATED",
  "GOAL_COMPLETED",
  "GOAL_CANCELLED",
  "ASSESSMENT_STARTED",
  "ASSESSMENT_COMPLETED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_UPDATED",
  "APPOINTMENT_COMPLETED",
  "APPOINTMENT_CANCELLED",
  "MEAL_PLAN_CREATED",
  "MEAL_PLAN_PUBLISHED",
] as const;

export type CareTimelineType = (typeof CARE_TIMELINE_TYPES)[number];

export type TimelineCategoryId =
  | "all"
  | "appointments"
  | "food"
  | "exercise"
  | "measurements"
  | "water"
  | "sleep"
  | "habits"
  | "goals"
  | "assessments"
  | "meal_plans";

export const TIMELINE_CATEGORIES: Array<{ id: TimelineCategoryId; label: string }> = [
  { id: "all", label: "All activities" },
  { id: "appointments", label: "Appointments" },
  { id: "food", label: "Food diary" },
  { id: "exercise", label: "Physical activity" },
  { id: "measurements", label: "Weight & measurements" },
  { id: "water", label: "Water" },
  { id: "sleep", label: "Sleep" },
  { id: "habits", label: "Habits" },
  { id: "goals", label: "Goals" },
  { id: "assessments", label: "Forms" },
  { id: "meal_plans", label: "Meal plans" },
];

const CATEGORY_TYPES: Record<Exclude<TimelineCategoryId, "all">, readonly string[]> = {
  appointments: [
    "APPOINTMENT_CREATED",
    "APPOINTMENT_UPDATED",
    "APPOINTMENT_COMPLETED",
    "APPOINTMENT_CANCELLED",
  ],
  food: ["FOOD_LOGGED"],
  exercise: ["EXERCISE_LOGGED"],
  measurements: ["MEASUREMENT_ADDED"],
  water: ["WATER_LOGGED"],
  sleep: ["SLEEP_LOGGED"],
  habits: ["HABIT_COMPLETED"],
  goals: ["GOAL_CREATED", "GOAL_COMPLETED", "GOAL_CANCELLED"],
  assessments: ["ASSESSMENT_STARTED", "ASSESSMENT_COMPLETED"],
  meal_plans: ["MEAL_PLAN_CREATED", "MEAL_PLAN_PUBLISHED"],
};

export function typesForTimelineCategory(category: TimelineCategoryId): readonly string[] {
  if (category === "all") return CARE_TIMELINE_TYPES;
  return CATEGORY_TYPES[category];
}

export function isCareTimelineType(type: string): boolean {
  return (CARE_TIMELINE_TYPES as readonly string[]).includes(type);
}

const CARE_ACTIVITY_LABELS: Record<string, string> = {
  MEASUREMENT_ADDED: "Measurement logged",
  FOOD_LOGGED: "Food diary entry",
  WATER_LOGGED: "Water logged",
  EXERCISE_LOGGED: "Physical activity",
  SLEEP_LOGGED: "Sleep logged",
  HABIT_COMPLETED: "Habit completed",
  GOAL_CREATED: "Goal created",
  GOAL_COMPLETED: "Goal completed",
  GOAL_CANCELLED: "Goal cancelled",
  ASSESSMENT_STARTED: "Form started",
  ASSESSMENT_COMPLETED: "Form completed",
  APPOINTMENT_CREATED: "Appointment scheduled",
  APPOINTMENT_UPDATED: "Appointment updated",
  APPOINTMENT_COMPLETED: "Appointment completed",
  APPOINTMENT_CANCELLED: "Appointment cancelled",
  MEAL_PLAN_CREATED: "Meal plan created",
  MEAL_PLAN_PUBLISHED: "Meal plan published",
};

export function careActivityLabel(type: string | null | undefined): string {
  if (!type) return "Activity";
  return CARE_ACTIVITY_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
