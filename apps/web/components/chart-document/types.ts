export const CLIENT_PRINT_DOCS = [
  "clinical",
  "assessments",
  "measurement",
  "tracking",
  "prescription",
  "nutrition",
  "nutrition-analysis",
] as const;

export type ClientPrintDoc = (typeof CLIENT_PRINT_DOCS)[number];

export type PrintField = { label: string; value: string };

export type ClinicalPrintBody = {
  sections: Array<{ title: string; fields: PrintField[] }>;
  goals: Array<{ title: string; status: string; description: string | null; targetDate: string | null }>;
  documents: Array<{ name: string; createdAt: string }>;
};

export type AssessmentsPrintBody = {
  submitted: Array<{
    name: string;
    completedAt: string | null;
    questions: Array<{ label: string; answer: string }>;
  }>;
  inProgress: Array<{ name: string; status: string; startedAt: string }>;
};

export type MeasurementPrintBody = {
  latest: Array<{ type: string; label: string; value: number; unit: string; measuredAt: string }>;
  history: Array<{ type: string; label: string; value: number; unit: string; measuredAt: string }>;
};

export type TrackingPrintBody = {
  from: string;
  to: string;
  days: Array<{
    date: string;
    foods: Array<{ name: string; quantity: number; unit: string; meal: string | null }>;
    waterMl: number;
    exercise: Array<{ activity: string; minutes: number; intensity: string | null }>;
    sleep: { minutes: number | null; quality: number | null } | null;
    habits: Array<{ name: string; completed: boolean }>;
  }>;
};

export type PrescriptionPrintBody = {
  current: {
    weightKg: number | null;
    weightUnit: string | null;
    height: number | null;
    heightUnit: string | null;
    bmi: number | null;
    bodyFatPct: number | null;
  };
  goals: { weightKg: number | null; bodyFatPct: number | null; energyKcal: number | null };
  energy: {
    bmrFormula: string | null;
    energyFormula: string | null;
    palCurrentKey: string | null;
    palCurrentValue: number | null;
    palGoalKey: string | null;
  };
  macros: {
    fatPct: number | null;
    carbPct: number | null;
    proteinPct: number | null;
    proteinPerKg: number | null;
    fiberGoalG: number | null;
  };
  duration: { beginDate: string | null; forecastFinishDate: string | null };
};

export type NutritionPrintBody = {
  plan: { name: string; status: string; version: number | null; versionStatus?: string } | null;
  days: Array<{
    title: string | null;
    weekday: string | null;
    meals: Array<{
      name: string;
      items: Array<{ name: string; quantity: number; unit: string }>;
    }>;
  }>;
};

export type NutritionMacroTotals = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

export type NutritionPresented = NutritionMacroTotals & {
  sugarG?: number | null;
  sodiumMg?: number | null;
};

export type NutritionAnalysisMeal = {
  name: string;
  totals?: NutritionMacroTotals;
  presented: NutritionPresented;
  extras?: Record<string, number | null>;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    itemType: string;
    food: { name: string; category: string | null } | null;
    presented: NutritionPresented;
  }>;
};

export type NutritionAnalysisPrintBody = {
  plan: { name: string; status: string; version: number | null; versionStatus?: string } | null;
  targets: NutritionMacroTotals;
  targetsFromClient?: boolean;
  days: Array<{
    title: string | null;
    weekday: string | null;
    dayNumber?: number;
    totals?: NutritionMacroTotals;
    presented: NutritionPresented;
    extras: Record<string, number | null>;
    meals: NutritionAnalysisMeal[];
  }>;
};

export type ClientPrintPayload = {
  practice: {
    practiceName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    address: string | null;
  };
  dietitian: {
    name: string;
    title: string | null;
    specialization: string | null;
    email: string | null;
  };
  client: {
    name: string;
    email: string | null;
    ageYears: number | null;
    height: { value: number; unit: string } | null;
    weight: { value: number; unit: string } | null;
    bmi: number | null;
  };
  generatedAt: string;
  doc: ClientPrintDoc;
  title: string;
  body:
    | ClinicalPrintBody
    | AssessmentsPrintBody
    | MeasurementPrintBody
    | TrackingPrintBody
    | PrescriptionPrintBody
    | NutritionPrintBody
    | NutritionAnalysisPrintBody;
};

export const CLIENT_PRINT_TITLES: Record<ClientPrintDoc, string> = {
  clinical: "Clinical profile",
  assessments: "Custom forms",
  measurement: "Measurements",
  tracking: "Tracking",
  prescription: "Prescription",
  nutrition: "Nutrition plan",
  "nutrition-analysis": "Nutrition analysis",
};

export type ChartPrintAction = {
  doc: ClientPrintDoc;
  label: string;
  hint: string;
};

const PERSONAL_PRINT_ACTIONS: ChartPrintAction[] = [
  { doc: "clinical", label: "Clinical profile", hint: "Identity, history, and notes" },
  { doc: "assessments", label: "Custom forms", hint: "Submitted and in-progress forms" },
];

const PROGRESS_PRINT_ACTIONS: ChartPrintAction[] = [
  { doc: "measurement", label: "Measurements", hint: "Latest values and history" },
  { doc: "tracking", label: "Tracking", hint: "Food, water, activity, and habits" },
];

const NUTRITION_PRINT_ACTIONS: ChartPrintAction[] = [
  { doc: "nutrition", label: "Meal plan", hint: "Days, meals, and items" },
  { doc: "nutrition-analysis", label: "Analysis", hint: "Macros, charts, and foods" },
];

const PRESCRIPTION_PRINT_ACTIONS: ChartPrintAction[] = [
  { doc: "prescription", label: "Prescription", hint: "Goals, energy, and macros" },
];

export function chartPrintActions(tab: string): ChartPrintAction[] {
  if (tab === "clinical" || tab === "assessments") return PERSONAL_PRINT_ACTIONS;
  if (tab === "measurement" || tab === "tracking") return PROGRESS_PRINT_ACTIONS;
  if (tab === "meal-plan" || tab === "nutrition-analysis") return NUTRITION_PRINT_ACTIONS;
  if (tab === "prescription") return PRESCRIPTION_PRINT_ACTIONS;
  return [];
}

export function isClientPrintDoc(value: string | null | undefined): value is ClientPrintDoc {
  return Boolean(value && (CLIENT_PRINT_DOCS as readonly string[]).includes(value));
}
