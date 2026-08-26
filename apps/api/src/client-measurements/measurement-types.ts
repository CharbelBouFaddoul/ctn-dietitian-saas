import type { MeasurementType } from "@prisma/client";

/** All stored measurement types (excludes computed BMI). */
export const STORED_MEASUREMENT_TYPES = [
  "WEIGHT",
  "HEIGHT",
  "WAIST",
  "HIPS",
  "BODY_FAT",
  "FAT_MASS",
  "MUSCLE_MASS",
  "MUSCLE_MASS_PERCENT",
  "SKINFOLD_ABDOMINAL",
  "SKINFOLD_CHEST",
  "SKINFOLD_FRONT_THIGH",
  "SKINFOLD_MIDAXILLARY",
  "SKINFOLD_SUBSCAPULAR",
  "SKINFOLD_SUPRAILIAC",
  "SKINFOLD_TRICEPS",
  "BP_DIASTOLIC",
  "BP_SYSTOLIC",
  "CHOLESTEROL_HDL",
  "CHOLESTEROL_LDL",
  "CHOLESTEROL_TOTAL",
  "TRIGLYCERIDES",
] as const satisfies readonly MeasurementType[];

export type StoredMeasurementType = (typeof STORED_MEASUREMENT_TYPES)[number];
