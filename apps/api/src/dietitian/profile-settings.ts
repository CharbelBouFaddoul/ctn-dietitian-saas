import { BadRequestException } from "@nestjs/common";
import { STORED_MEASUREMENT_TYPES } from "../client-measurements/measurement-types";

export const MEAL_PLAN_SHARE_SECTIONS = [
  "client",
  "meals",
  "recommendations",
  "recipes",
  "signature",
] as const;

export const DEFAULT_MEAL_LABELS = ["Appetizer", "Dish", "Dessert", "Beverage"] as const;

export const NEW_APPOINTMENT_STATUSES = ["SCHEDULED"] as const;

export type MealPlanShare = {
  emailSubject: string;
  emailBody: string;
  includeSections: string[];
  mealLabels: string[];
};

export type PortalPresets = {
  messaging: boolean;
  tracking: boolean;
  mealPlans: boolean;
};

export function defaultMealPlanShare(): MealPlanShare {
  return {
    emailSubject: "Meal plan",
    emailBody: "Hi [Client_first_name], your meal plan is ready.\n\nBest regards",
    includeSections: [...MEAL_PLAN_SHARE_SECTIONS],
    mealLabels: [...DEFAULT_MEAL_LABELS],
  };
}

export function defaultPortalPresets(): PortalPresets {
  return {
    messaging: true,
    tracking: true,
    mealPlans: true,
  };
}

export function defaultAppointmentReminders(hoursBefore = 24): number[] {
  return [hoursBefore];
}

export function normalizeAppointmentReminders(value: unknown, fallbackHours: number): number[] {
  const source = Array.isArray(value) ? value : defaultAppointmentReminders(fallbackHours);
  const hours = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 168);
  const unique = [...new Set(hours)].slice(0, 3);
  if (unique.length === 0) {
    throw new BadRequestException("appointmentReminders must include 1 to 3 values between 1 and 168 hours");
  }
  return unique.sort((a, b) => a - b);
}

export function normalizeMealPlanShare(value: unknown): MealPlanShare {
  const defaults = defaultMealPlanShare();
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const includeSections = Array.isArray(raw.includeSections)
    ? raw.includeSections.filter((item): item is string => typeof item === "string")
    : defaults.includeSections;
  const unknownSection = includeSections.find((item) => !MEAL_PLAN_SHARE_SECTIONS.includes(item as (typeof MEAL_PLAN_SHARE_SECTIONS)[number]));
  if (unknownSection) {
    throw new BadRequestException(`Unknown meal plan section: ${unknownSection}`);
  }
  const mealLabels = Array.isArray(raw.mealLabels)
    ? raw.mealLabels.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 12)
    : defaults.mealLabels;
  return {
    emailSubject:
      typeof raw.emailSubject === "string" && raw.emailSubject.trim()
        ? raw.emailSubject.trim().slice(0, 200)
        : defaults.emailSubject,
    emailBody: typeof raw.emailBody === "string" ? raw.emailBody.slice(0, 5000) : defaults.emailBody,
    includeSections: includeSections.length > 0 ? includeSections : defaults.includeSections,
    mealLabels: mealLabels.length > 0 ? mealLabels : defaults.mealLabels,
  };
}

export function normalizeEnabledMeasurements(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    throw new BadRequestException("enabledMeasurements must be an array of measurement types");
  }
  const types = value.filter((item): item is string => typeof item === "string");
  const unknown = types.find((item) => !(STORED_MEASUREMENT_TYPES as readonly string[]).includes(item));
  if (unknown) {
    throw new BadRequestException(`Unknown measurement type: ${unknown}`);
  }
  return [...new Set(types)];
}

export function normalizePortalPresets(value: unknown): PortalPresets {
  const defaults = defaultPortalPresets();
  if (value == null) return defaults;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("portalPresets must be an object");
  }
  const raw = value as Record<string, unknown>;
  return {
    messaging: typeof raw.messaging === "boolean" ? raw.messaging : defaults.messaging,
    tracking: typeof raw.tracking === "boolean" ? raw.tracking : defaults.tracking,
    mealPlans: typeof raw.mealPlans === "boolean" ? raw.mealPlans : defaults.mealPlans,
  };
}
