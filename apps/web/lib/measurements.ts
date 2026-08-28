export type MeasurementMetricId =
  | "WEIGHT"
  | "HEIGHT"
  | "WAIST"
  | "HIPS"
  | "BODY_FAT"
  | "FAT_MASS"
  | "MUSCLE_MASS"
  | "MUSCLE_MASS_PERCENT"
  | "LEAN_MASS"
  | "BMI"
  | "NECK"
  | "CHEST"
  | "ABDOMEN"
  | "ARM"
  | "FOREARM"
  | "WRIST"
  | "THIGH"
  | "CALF"
  | "SKINFOLD_ABDOMINAL"
  | "SKINFOLD_CHEST"
  | "SKINFOLD_FRONT_THIGH"
  | "SKINFOLD_MIDAXILLARY"
  | "SKINFOLD_SUBSCAPULAR"
  | "SKINFOLD_SUPRAILIAC"
  | "SKINFOLD_TRICEPS"
  | "BP_DIASTOLIC"
  | "BP_SYSTOLIC"
  | "CHOLESTEROL_HDL"
  | "CHOLESTEROL_LDL"
  | "CHOLESTEROL_TOTAL"
  | "TRIGLYCERIDES";

export type MeasurementMetric = {
  id: MeasurementMetricId;
  label: string;
  unit: string;
  units: string[];
  /** False for computed metrics such as BMI. */
  stored: boolean;
};

export type MeasurementGroup = {
  id: string;
  label: string;
  metrics: MeasurementMetric[];
};

export const MEASUREMENT_GROUPS: MeasurementGroup[] = [
  {
    id: "basic",
    label: "Basic measurements",
    metrics: [
      { id: "WEIGHT", label: "Weight", unit: "kg", units: ["kg", "lb"], stored: true },
      { id: "HEIGHT", label: "Height", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "HIPS", label: "Hip circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "WAIST", label: "Waist circumference", unit: "cm", units: ["cm", "in"], stored: true },
    ],
  },
  {
    id: "body",
    label: "Body composition",
    metrics: [
      { id: "BODY_FAT", label: "Body fat percentage", unit: "%", units: ["%"], stored: true },
      { id: "FAT_MASS", label: "Fat mass", unit: "kg", units: ["kg", "lb"], stored: true },
      { id: "MUSCLE_MASS", label: "Muscle mass", unit: "kg", units: ["kg", "lb"], stored: true },
      {
        id: "MUSCLE_MASS_PERCENT",
        label: "Muscle mass percentage",
        unit: "%",
        units: ["%"],
        stored: true,
      },
      { id: "LEAN_MASS", label: "Lean mass", unit: "kg", units: ["kg", "lb"], stored: false },
      { id: "BMI", label: "BMI", unit: "kg/m²", units: [], stored: false },
    ],
  },
  {
    id: "circumferences",
    label: "Body measurements",
    metrics: [
      { id: "NECK", label: "Neck circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "CHEST", label: "Chest circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "ABDOMEN", label: "Abdomen circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "ARM", label: "Arm circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "FOREARM", label: "Forearm circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "WRIST", label: "Wrist circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "THIGH", label: "Thigh circumference", unit: "cm", units: ["cm", "in"], stored: true },
      { id: "CALF", label: "Calf circumference", unit: "cm", units: ["cm", "in"], stored: true },
    ],
  },
  {
    id: "skinfolds",
    label: "Skinfolds",
    metrics: [
      { id: "SKINFOLD_ABDOMINAL", label: "Abdominal skinfold", unit: "mm", units: ["mm"], stored: true },
      { id: "SKINFOLD_CHEST", label: "Chest skinfold", unit: "mm", units: ["mm"], stored: true },
      { id: "SKINFOLD_FRONT_THIGH", label: "Front thigh skinfold", unit: "mm", units: ["mm"], stored: true },
      { id: "SKINFOLD_MIDAXILLARY", label: "Midaxillary skinfold", unit: "mm", units: ["mm"], stored: true },
      { id: "SKINFOLD_SUBSCAPULAR", label: "Subscapular skinfold", unit: "mm", units: ["mm"], stored: true },
      { id: "SKINFOLD_SUPRAILIAC", label: "Suprailiac skinfold", unit: "mm", units: ["mm"], stored: true },
      { id: "SKINFOLD_TRICEPS", label: "Triceps skinfold", unit: "mm", units: ["mm"], stored: true },
    ],
  },
  {
    id: "analytical",
    label: "Analytical data",
    metrics: [
      { id: "BP_DIASTOLIC", label: "Diastolic blood pressure", unit: "mmHg", units: ["mmHg"], stored: true },
      { id: "BP_SYSTOLIC", label: "Systolic blood pressure", unit: "mmHg", units: ["mmHg"], stored: true },
      { id: "CHOLESTEROL_HDL", label: "HDL Cholesterol", unit: "mg/dL", units: ["mg/dL"], stored: true },
      { id: "CHOLESTEROL_LDL", label: "LDL Cholesterol", unit: "mg/dL", units: ["mg/dL"], stored: true },
      { id: "CHOLESTEROL_TOTAL", label: "Total cholesterol", unit: "mg/dL", units: ["mg/dL"], stored: true },
      { id: "TRIGLYCERIDES", label: "Triglycerides", unit: "mg/dL", units: ["mg/dL"], stored: true },
    ],
  },
];

export const ALL_MEASUREMENT_METRICS = MEASUREMENT_GROUPS.flatMap((group) => group.metrics);

export const STORED_MEASUREMENT_METRICS = ALL_MEASUREMENT_METRICS.filter((m) => m.stored);

const METRIC_IDS = ALL_MEASUREMENT_METRICS.map((m) => m.id);

export function isMeasurementMetricId(value: string | null | undefined): value is MeasurementMetricId {
  return !!value && (METRIC_IDS as readonly string[]).includes(value);
}

export function findMeasurementMetric(id: string): MeasurementMetric | undefined {
  return ALL_MEASUREMENT_METRICS.find((m) => m.id === id);
}

export function formatMeasurementValue(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded} ${unit}`.trim();
}
