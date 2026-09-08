/**
 * Faculty / Lebanon clinical method taught in Lebanese nutrition programs.
 * Hamwi IBW (faculty sheet constants), FAO PAL bands, and ADA exchanges.
 * Leftover Excel cell bugs are corrected here — do not copy the workbook formulas.
 */

export type FacultySex = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";

export type FacultyPalOption = { key: string; label: string; value: number };

export const FACULTY_PAL_OPTIONS: FacultyPalOption[] = [
  { key: "faculty_sedentary", label: "Sedentary", value: 1.3 },
  { key: "faculty_light", label: "Light", value: 1.4 },
  { key: "faculty_moderate", label: "Moderate", value: 1.6 },
  { key: "faculty_heavy", label: "Heavy", value: 1.9 },
];

export const FACULTY_METHOD_LABEL = "Lebanese faculty";
export const FACULTY_METHOD_TITLE = "Lebanese faculty method";
export const IOM_METHOD_LABEL = "International (IOM)";
export const IOM_METHOD_HINT = "Mifflin-St Jeor, activity factors, and daily energy and macros.";
export const FACULTY_METHOD_HINT =
  "Hamwi ideal body weight, FAO activity levels, and food-exchange plans.";
export const CLINIC_METHOD_HELP = "Applies to every client chart: Prescription, Measurement, and Nutrition.";
export const CLINIC_METHOD_TOOLTIP =
  "Clinic calculation method. Changing this updates every client — Prescription, Measurement, and Nutrition.";
export const IOM_METHOD_TOOLTIP =
  "International (IOM): Mifflin-St Jeor energy, activity level, and daily kcal and macros.";
export const FACULTY_METHOD_TOOLTIP =
  "Lebanese faculty method: Hamwi ideal body weight, FAO activity levels, and food-exchange plans.";

export type NutritionMethod = "iom" | "faculty_lebanon";

export const NUTRITION_METHODS = ["iom", "faculty_lebanon"] as const;
export const DEFAULT_NUTRITION_METHOD: NutritionMethod = "iom";

export function isNutritionMethod(value: unknown): value is NutritionMethod {
  return value === "iom" || value === "faculty_lebanon";
}

export function sanitizeNutritionMethod(
  value: unknown,
  fallback: NutritionMethod = DEFAULT_NUTRITION_METHOD,
): NutritionMethod {
  return isNutritionMethod(value) ? value : fallback;
}

export function resolveNutritionMethod(stored: unknown, clinicDefault?: unknown): NutritionMethod {
  if (isNutritionMethod(stored)) return stored;
  return sanitizeNutritionMethod(clinicDefault);
}

export function isFacultyMethod(method: NutritionMethod | string | null | undefined): boolean {
  return method === "faculty_lebanon";
}

export const FACULTY_ADULT_MIN_AGE = 18;

export type FacultyExchangeId =
  | "milkFatFree"
  | "milkReduced"
  | "milkWhole"
  | "fruit"
  | "bread"
  | "vegetable"
  | "meatLean"
  | "meatMedium"
  | "meatHigh"
  | "fatMufa"
  | "fatPufa"
  | "fatSafa"
  | "sugar";

export type FacultyExchanges = Record<FacultyExchangeId, number>;

export type FacultyExchangeGroup = {
  id: FacultyExchangeId;
  label: string;
  section: "Milk" | "Carbohydrate" | "Meat" | "Fat" | "Other";
  choG: number;
  proteinG: number;
  fatG: number;
  kcal: number;
};

/** ADA Choose Your Foods (2008 teaching list) used in Lebanese faculties. */
export const FACULTY_EXCHANGE_GROUPS: FacultyExchangeGroup[] = [
  { id: "milkFatFree", label: "Milk (fat-free / 1%)", section: "Milk", choG: 12, proteinG: 8, fatG: 3, kcal: 100 },
  { id: "milkReduced", label: "Milk (reduced-fat)", section: "Milk", choG: 12, proteinG: 8, fatG: 5, kcal: 120 },
  { id: "milkWhole", label: "Milk (whole)", section: "Milk", choG: 12, proteinG: 8, fatG: 8, kcal: 160 },
  { id: "fruit", label: "Fruits", section: "Carbohydrate", choG: 15, proteinG: 0, fatG: 0, kcal: 60 },
  { id: "bread", label: "Bread & cereals", section: "Carbohydrate", choG: 15, proteinG: 3, fatG: 1, kcal: 80 },
  { id: "vegetable", label: "Vegetables", section: "Carbohydrate", choG: 5, proteinG: 2, fatG: 0, kcal: 25 },
  { id: "meatLean", label: "Lean meat", section: "Meat", choG: 0, proteinG: 7, fatG: 3, kcal: 45 },
  { id: "meatMedium", label: "Medium-fat meat", section: "Meat", choG: 0, proteinG: 7, fatG: 5, kcal: 75 },
  { id: "meatHigh", label: "High-fat meat", section: "Meat", choG: 0, proteinG: 7, fatG: 8, kcal: 100 },
  { id: "fatMufa", label: "Fat (MUFA)", section: "Fat", choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
  { id: "fatPufa", label: "Fat (PUFA)", section: "Fat", choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
  { id: "fatSafa", label: "Fat (SAFA)", section: "Fat", choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
  { id: "sugar", label: "Sugar", section: "Other", choG: 15, proteinG: 0, fatG: 0, kcal: 60 },
];

export const FACULTY_EXCHANGE_IDS = FACULTY_EXCHANGE_GROUPS.map((group) => group.id);

export function emptyFacultyExchanges(): FacultyExchanges {
  return {
    milkFatFree: 0,
    milkReduced: 0,
    milkWhole: 0,
    fruit: 0,
    bread: 0,
    vegetable: 0,
    meatLean: 0,
    meatMedium: 0,
    meatHigh: 0,
    fatMufa: 0,
    fatPufa: 0,
    fatSafa: 0,
    sugar: 0,
  };
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isFemale(sex: FacultySex | string | null | undefined): boolean {
  return sex === "FEMALE";
}

export function facultyPalValue(key: string | null | undefined): number | null {
  if (!key) return null;
  return FACULTY_PAL_OPTIONS.find((option) => option.key === key)?.value ?? null;
}

export function isFacultyPalKey(key: string | null | undefined): boolean {
  return Boolean(key && FACULTY_PAL_OPTIONS.some((option) => option.key === key));
}

/** Hamwi IBW from the faculty sheet. Adult-only (age ≥ 18). */
export function computeFacultyIbw(
  heightCm: number | null,
  sex: FacultySex | string | null,
  ageYears: number | null,
): number | null {
  const height = num(heightCm);
  const age = num(ageYears);
  if (height == null || height <= 0) return null;
  if (age != null && age < FACULTY_ADULT_MIN_AGE) return null;
  if (isFemale(sex)) return round(((height - 152) / 2.54) * 2.2 + 45, 1);
  if (sex === "MALE") return round(((height - 152) / 2.52) * 2.7 + 48, 1);
  return null;
}

export function percentOf(part: number | null, whole: number | null): number | null {
  const p = num(part);
  const w = num(whole);
  if (p == null || w == null || w <= 0) return null;
  return round((p / w) * 100, 1);
}

export function computeFacultyAbw(actualKg: number | null, ibwKg: number | null): number | null {
  const actual = num(actualKg);
  const ibw = num(ibwKg);
  if (actual == null || ibw == null) return null;
  return round(ibw + 0.25 * (actual - ibw), 1);
}

export function facultyObeseForAbw(bmi: number | null, percentIbw: number | null): boolean {
  return (bmi != null && bmi >= 30) || (percentIbw != null && percentIbw >= 125);
}

/** (usual − current) / usual × 100. Positive = weight lost. */
export function percentWeightChange(usualKg: number | null, currentKg: number | null): number | null {
  const usual = num(usualKg);
  const current = num(currentKg);
  if (usual == null || current == null || usual <= 0) return null;
  return round(((usual - current) / usual) * 100, 1);
}

export function computeWhr(waistCm: number | null, hipCm: number | null): number | null {
  const waist = num(waistCm);
  const hip = num(hipCm);
  if (waist == null || hip == null || hip <= 0) return null;
  return round(waist / hip, 2);
}

export function whrElevated(whr: number | null, sex: FacultySex | string | null): boolean {
  if (whr == null) return false;
  if (isFemale(sex)) return whr >= 0.85;
  if (sex === "MALE") return whr >= 0.9;
  return false;
}

export type FacultyFrameSize = "Small" | "Medium" | "Large";

/** Grant r-value: height (cm) / wrist (cm). */
export function computeFrameRatio(heightCm: number | null, wristCm: number | null): number | null {
  const height = num(heightCm);
  const wrist = num(wristCm);
  if (height == null || wrist == null || wrist <= 0) return null;
  return round(height / wrist, 2);
}

export function facultyFrameSize(
  ratio: number | null,
  sex: FacultySex | string | null,
): FacultyFrameSize | null {
  if (ratio == null) return null;
  if (isFemale(sex)) {
    if (ratio > 11) return "Small";
    if (ratio >= 10.1) return "Medium";
    return "Large";
  }
  if (sex === "MALE") {
    if (ratio > 10.4) return "Small";
    if (ratio >= 9.6) return "Medium";
    return "Large";
  }
  return null;
}

export type FacultyExchangeLine = FacultyExchangeGroup & {
  count: number;
  choTotalG: number;
  proteinTotalG: number;
  fatTotalG: number;
  kcalTotal: number;
};

export type FacultyExchangeTally = {
  lines: FacultyExchangeLine[];
  count: number;
  carbohydrateG: number;
  proteinG: number;
  fatG: number;
  exchangeKcal: number;
  atwaterKcal: number;
  carbPct: number | null;
  proteinPct: number | null;
  fatPct: number | null;
};

function exchangeCount(value: number | null | undefined): number {
  const n = num(value);
  if (n == null || n <= 0) return 0;
  return round(Math.min(50, n), 1);
}

export function tallyExchanges(exchanges: Partial<FacultyExchanges> | null | undefined): FacultyExchangeTally {
  const source = { ...emptyFacultyExchanges(), ...(exchanges ?? {}) };
  const lines = FACULTY_EXCHANGE_GROUPS.map((group) => {
    const count = exchangeCount(source[group.id]);
    return {
      ...group,
      count,
      choTotalG: round(count * group.choG, 1),
      proteinTotalG: round(count * group.proteinG, 1),
      fatTotalG: round(count * group.fatG, 1),
      kcalTotal: round(count * group.kcal, 0),
    };
  });
  const carbohydrateG = round(
    lines.reduce((sum, line) => sum + line.choTotalG, 0),
    1,
  );
  const proteinG = round(
    lines.reduce((sum, line) => sum + line.proteinTotalG, 0),
    1,
  );
  const fatG = round(
    lines.reduce((sum, line) => sum + line.fatTotalG, 0),
    1,
  );
  const exchangeKcal = Math.round(lines.reduce((sum, line) => sum + line.kcalTotal, 0));
  const atwaterKcal = Math.round(carbohydrateG * 4 + proteinG * 4 + fatG * 9);
  const carbKcal = carbohydrateG * 4;
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  return {
    lines,
    count: round(
      lines.reduce((sum, line) => sum + line.count, 0),
      1,
    ),
    carbohydrateG,
    proteinG,
    fatG,
    exchangeKcal,
    atwaterKcal,
    carbPct: atwaterKcal > 0 ? round((carbKcal / atwaterKcal) * 100, 1) : null,
    proteinPct: atwaterKcal > 0 ? round((proteinKcal / atwaterKcal) * 100, 1) : null,
    fatPct: atwaterKcal > 0 ? round((fatKcal / atwaterKcal) * 100, 1) : null,
  };
}

export function facultyMacroPercents(tally: FacultyExchangeTally): {
  fatPct: number | null;
  carbPct: number | null;
  proteinPct: number | null;
} {
  return {
    fatPct: tally.fatPct,
    carbPct: tally.carbPct,
    proteinPct: tally.proteinPct,
  };
}

export type FacultyPlanTargets = {
  energyKcal: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
  proteinG: number | null;
  fiberG: number | null;
};

/** Nutrition Analysis compares meals to the exchange plan — never to Mifflin × PAL. */
export function facultyTargetsFromExchanges(
  exchanges: Partial<FacultyExchanges> | null | undefined,
): FacultyPlanTargets {
  const tally = tallyExchanges(exchanges);
  if (tally.atwaterKcal <= 0) {
    return { energyKcal: null, fatG: null, carbohydrateG: null, proteinG: null, fiberG: null };
  }
  return {
    energyKcal: tally.atwaterKcal,
    fatG: tally.fatG,
    carbohydrateG: tally.carbohydrateG,
    proteinG: tally.proteinG,
    fiberG: null,
  };
}

export function mergeFacultyExchanges(value: unknown): FacultyExchanges {
  const empty = emptyFacultyExchanges();
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const record = value as Record<string, unknown>;
  const next = { ...empty };
  for (const id of FACULTY_EXCHANGE_IDS) {
    next[id] = exchangeCount(typeof record[id] === "number" ? record[id] : Number(record[id]));
  }
  return next;
}
