/**
 * Nutrition-prescription calculations: anthropometry, body composition, energy
 * needs and macro distribution. All functions are pure and return `null` when
 * the required inputs are missing so the UI can fall back to manual overrides.
 *
 * Formula references:
 * - Body fat (skinfold -> density): Durnin & Womersley 1974; Jackson & Pollock 1978/1980.
 * - Density -> %fat: Siri 1961, Brozek 1963.
 * - Peterson et al. 2003 (4-compartment validated skinfold equation).
 * - RFM: Woolcott & Bergman 2018 (waist + height).
 * - CUN-BAE: Gomez-Ambrosi et al. 2012 (BMI + age + sex).
 * - BMR: Mifflin-St Jeor 1990; Harris-Benedict (Roza 1984); FAO/WHO/UNU 1985 (Schofield);
 *   Katch-McArdle; Cunningham 1980.
 * - PAL bands & AMDR: IOM/DRI.
 */

export type PrescriptionSex = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";

export type SkinfoldSite =
  | "triceps"
  | "subscapular"
  | "suprailiac"
  | "biceps"
  | "chest"
  | "abdominal"
  | "thigh"
  | "midaxillary";

export type PrescriptionInputs = {
  sex: PrescriptionSex;
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  skinfolds: Partial<Record<SkinfoldSite, number | null>>;
};

function isFemale(sex: PrescriptionSex): boolean {
  return sex === "FEMALE";
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Sum of skinfold sites (mm); returns null if any requested site is missing. */
function sumSkinfolds(inputs: PrescriptionInputs, sites: SkinfoldSite[]): number | null {
  let total = 0;
  for (const site of sites) {
    const value = num(inputs.skinfolds[site]);
    if (value == null || value <= 0) return null;
    total += value;
  }
  return total;
}

// ── BMI ──────────────────────────────────────────────────────────────────────

export function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  const w = num(weightKg);
  const h = num(heightCm);
  if (w == null || h == null || h <= 0) return null;
  const meters = h / 100;
  return round(w / (meters * meters), 1);
}

export type BmiCategory = "Underweight" | "Normal" | "Overweight" | "Obese";

export function bmiCategory(bmi: number | null): BmiCategory | null {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

/** Healthy weight range (kg) for a BMI window of 18.5–24.9 at the given height. */
export function healthyWeightRange(heightCm: number | null): { min: number; max: number } | null {
  const h = num(heightCm);
  if (h == null || h <= 0) return null;
  const meters = h / 100;
  return {
    min: round(18.5 * meters * meters, 1),
    max: round(24.9 * meters * meters, 1),
  };
}

/** Reference weight (kg) at the midpoint of the healthy BMI window (BMI 22). */
export function referenceWeightKg(heightCm: number | null): number | null {
  const h = num(heightCm);
  if (h == null || h <= 0) return null;
  const meters = h / 100;
  return round(22 * meters * meters, 1);
}

// ── Body-fat percentage ────────────────────────────────────────────────────

export type BodyFatConversion = "siri" | "brozek";

export type BodyFatFormulaId =
  | "durnin_womersley"
  | "jackson_pollock_3"
  | "jackson_pollock_7"
  | "peterson"
  | "rfm"
  | "cun_bae"
  | "deurenberg";

export type BodyFatFormula = {
  id: BodyFatFormulaId;
  label: string;
  /** Display grouping in the picker. */
  group: string;
  /** Whether the formula produces a body density that needs a Siri/Brozek conversion. */
  needsConversion: boolean;
  /** Short human hint of the measurements required. */
  requires: string;
};

export const BODY_FAT_FORMULAS: BodyFatFormula[] = [
  {
    id: "peterson",
    label: "Peterson Equation",
    group: "Direct calculation",
    needsConversion: false,
    requires: "Triceps, subscapular, suprailiac & thigh skinfolds + age, height",
  },
  {
    id: "rfm",
    label: "Relative Fat Mass (RFM)",
    group: "Direct calculation",
    needsConversion: false,
    requires: "Waist circumference + height",
  },
  {
    id: "cun_bae",
    label: "CUN-BAE",
    group: "Direct calculation",
    needsConversion: false,
    requires: "BMI + age",
  },
  {
    id: "deurenberg",
    label: "Deurenberg (BMI)",
    group: "Direct calculation",
    needsConversion: false,
    requires: "BMI + age",
  },
  {
    id: "durnin_womersley",
    label: "Durnin and Womersley Equation",
    group: "Indirect calculation (skinfold density)",
    needsConversion: true,
    requires: "Biceps, triceps, subscapular & suprailiac skinfolds + age",
  },
  {
    id: "jackson_pollock_3",
    label: "Jackson et al Equation (3 Skinfolds)",
    group: "Indirect calculation (skinfold density)",
    needsConversion: true,
    requires: "3 skinfolds (sex-specific) + age",
  },
  {
    id: "jackson_pollock_7",
    label: "Jackson et al Equation (7 Skinfolds)",
    group: "Indirect calculation (skinfold density)",
    needsConversion: true,
    requires: "7 skinfolds + age",
  },
];

export const DEFAULT_BODY_FAT_CONVERSION: BodyFatConversion = "siri";

/** Convert body density (g/cm^3) to body-fat percentage. */
function densityToBodyFat(density: number | null, conversion: BodyFatConversion): number | null {
  if (density == null || density <= 0) return null;
  const pct = conversion === "brozek" ? 457 / density - 414.2 : 495 / density - 450;
  if (!Number.isFinite(pct)) return null;
  return pct;
}

const DW_MEN: Array<{ maxAge: number; c: number; m: number }> = [
  { maxAge: 19, c: 1.162, m: 0.063 },
  { maxAge: 29, c: 1.1631, m: 0.0632 },
  { maxAge: 39, c: 1.1422, m: 0.0544 },
  { maxAge: 49, c: 1.162, m: 0.07 },
  { maxAge: 200, c: 1.1715, m: 0.0779 },
];

const DW_WOMEN: Array<{ maxAge: number; c: number; m: number }> = [
  { maxAge: 19, c: 1.1549, m: 0.0678 },
  { maxAge: 29, c: 1.1599, m: 0.0717 },
  { maxAge: 39, c: 1.1423, m: 0.0632 },
  { maxAge: 49, c: 1.1333, m: 0.0612 },
  { maxAge: 200, c: 1.1339, m: 0.0645 },
];

function durninWomersleyDensity(inputs: PrescriptionInputs): number | null {
  const age = num(inputs.ageYears);
  const sum = sumSkinfolds(inputs, ["biceps", "triceps", "subscapular", "suprailiac"]);
  if (age == null || sum == null || sum <= 0) return null;
  const bands = isFemale(inputs.sex) ? DW_WOMEN : DW_MEN;
  const band = bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1];
  if (!band) return null;
  return band.c - band.m * Math.log10(sum);
}

function jacksonPollock3Density(inputs: PrescriptionInputs): number | null {
  const age = num(inputs.ageYears);
  if (age == null) return null;
  if (isFemale(inputs.sex)) {
    const sum = sumSkinfolds(inputs, ["triceps", "suprailiac", "thigh"]);
    if (sum == null) return null;
    return 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
  }
  const sum = sumSkinfolds(inputs, ["chest", "abdominal", "thigh"]);
  if (sum == null) return null;
  return 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age;
}

function jacksonPollock7Density(inputs: PrescriptionInputs): number | null {
  const age = num(inputs.ageYears);
  const sum = sumSkinfolds(inputs, [
    "chest",
    "midaxillary",
    "triceps",
    "subscapular",
    "abdominal",
    "suprailiac",
    "thigh",
  ]);
  if (age == null || sum == null) return null;
  if (isFemale(inputs.sex)) {
    return 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
  }
  return 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age;
}

function petersonBodyFat(inputs: PrescriptionInputs): number | null {
  const age = num(inputs.ageYears);
  const height = num(inputs.heightCm);
  const sum = sumSkinfolds(inputs, ["triceps", "subscapular", "suprailiac", "thigh"]);
  if (age == null || height == null || sum == null) return null;
  if (isFemale(inputs.sex)) {
    const bmi = computeBmi(inputs.weightKg, inputs.heightCm);
    if (bmi == null) return null;
    return (
      22.18945 +
      0.06368 * age +
      0.60404 * bmi -
      0.1452 * height +
      0.30919 * sum -
      0.00099562 * sum * sum
    );
  }
  return 20.94878 + 0.1166 * age - 0.11666 * height + 0.42696 * sum - 0.00159 * sum * sum;
}

function rfmBodyFat(inputs: PrescriptionInputs): number | null {
  const height = num(inputs.heightCm);
  const waist = num(inputs.waistCm);
  if (height == null || waist == null || waist <= 0) return null;
  const sexFactor = isFemale(inputs.sex) ? 12 : 0;
  return 64 - 20 * (height / waist) + sexFactor;
}

function deurenbergBodyFat(inputs: PrescriptionInputs): number | null {
  const age = num(inputs.ageYears);
  const bmi = computeBmi(inputs.weightKg, inputs.heightCm);
  if (age == null || bmi == null) return null;
  const sex = isFemale(inputs.sex) ? 0 : 1;
  // Children (<= 15) use the age-specific childhood formula.
  if (age <= 15) return 1.51 * bmi - 0.7 * age - 3.6 * sex + 1.4;
  return 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4;
}

function cunBaeBodyFat(inputs: PrescriptionInputs): number | null {
  const age = num(inputs.ageYears);
  const bmi = computeBmi(inputs.weightKg, inputs.heightCm);
  if (age == null || bmi == null) return null;
  const sex = isFemale(inputs.sex) ? 1 : 0;
  return (
    -44.988 +
    0.503 * age +
    10.689 * sex +
    3.172 * bmi -
    0.026 * bmi * bmi +
    0.181 * bmi * sex -
    0.02 * bmi * age -
    0.005 * bmi * bmi * sex +
    0.00021 * bmi * bmi * age
  );
}

/** Estimate body-fat %; returns null when the formula's inputs are unavailable. */
export function computeBodyFat(
  formula: BodyFatFormulaId,
  conversion: BodyFatConversion,
  inputs: PrescriptionInputs,
): number | null {
  let pct: number | null = null;
  switch (formula) {
    case "peterson":
      pct = petersonBodyFat(inputs);
      break;
    case "rfm":
      pct = rfmBodyFat(inputs);
      break;
    case "cun_bae":
      pct = cunBaeBodyFat(inputs);
      break;
    case "deurenberg":
      pct = deurenbergBodyFat(inputs);
      break;
    case "durnin_womersley":
      pct = densityToBodyFat(durninWomersleyDensity(inputs), conversion);
      break;
    case "jackson_pollock_3":
      pct = densityToBodyFat(jacksonPollock3Density(inputs), conversion);
      break;
    case "jackson_pollock_7":
      pct = densityToBodyFat(jacksonPollock7Density(inputs), conversion);
      break;
    default:
      pct = null;
  }
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct < 0) return 0;
  if (pct > 75) return 75;
  return round(pct, 1);
}

/** Pick the most data-appropriate default body-fat formula. */
export function suggestBodyFatFormula(inputs: PrescriptionInputs): BodyFatFormulaId {
  const order: BodyFatFormulaId[] = [
    "jackson_pollock_7",
    "peterson",
    "jackson_pollock_3",
    "rfm",
    "cun_bae",
    "deurenberg",
  ];
  for (const id of order) {
    if (computeBodyFat(id, DEFAULT_BODY_FAT_CONVERSION, inputs) != null) return id;
  }
  return "cun_bae";
}

/** General acceptable body-fat range by sex, for the reference column. */
export function bodyFatReferenceRange(sex: PrescriptionSex): { min: number; max: number } {
  return isFemale(sex) ? { min: 21, max: 33 } : { min: 8, max: 20 };
}

// ── Basal metabolic rate ─────────────────────────────────────────────────────

export type BmrFormulaId =
  | "mifflin"
  | "harris_benedict"
  | "henry_oxford"
  | "who"
  | "schofield"
  | "owen"
  | "katch_mcardle"
  | "cunningham"
  | "ten_haaf";

export type BmrFormulaGroup = "General population" | "Body-composition based" | "Athletes";

export type BmrFormula = {
  id: BmrFormulaId;
  label: string;
  group: BmrFormulaGroup;
  /** Requires a body-fat estimate to derive lean body mass. */
  needsBodyFat: boolean;
};

export const BMR_FORMULAS: BmrFormula[] = [
  { id: "mifflin", label: "Mifflin-St Jeor", group: "General population", needsBodyFat: false },
  { id: "harris_benedict", label: "Harris-Benedict", group: "General population", needsBodyFat: false },
  { id: "henry_oxford", label: "Henry / Oxford (2005)", group: "General population", needsBodyFat: false },
  { id: "who", label: "WHO / FAO / Schofield (weight)", group: "General population", needsBodyFat: false },
  { id: "schofield", label: "Schofield (weight & height)", group: "General population", needsBodyFat: false },
  { id: "owen", label: "Owen (1986/87)", group: "General population", needsBodyFat: false },
  { id: "katch_mcardle", label: "Katch-McArdle", group: "Body-composition based", needsBodyFat: true },
  { id: "cunningham", label: "Cunningham", group: "Body-composition based", needsBodyFat: true },
  { id: "ten_haaf", label: "Ten Haaf (2014, athletes)", group: "Athletes", needsBodyFat: false },
];

export const BMR_FORMULA_GROUPS: BmrFormulaGroup[] = [
  "General population",
  "Body-composition based",
  "Athletes",
];

export const DEFAULT_BMR_FORMULA: BmrFormulaId = "mifflin";

const WHO_MEN: Array<{ maxAge: number; a: number; b: number }> = [
  { maxAge: 30, a: 15.057, b: 692.2 },
  { maxAge: 60, a: 11.472, b: 873.1 },
  { maxAge: 200, a: 11.711, b: 587.7 },
];

const WHO_WOMEN: Array<{ maxAge: number; a: number; b: number }> = [
  { maxAge: 30, a: 14.818, b: 486.6 },
  { maxAge: 60, a: 8.126, b: 845.6 },
  { maxAge: 200, a: 9.082, b: 658.5 },
];

/** Henry (2005) "Oxford" weight-only BMR equations (kcal/day). */
const HENRY_MEN: Array<{ maxAge: number; a: number; b: number }> = [
  { maxAge: 18, a: 18.4, b: 581 },
  { maxAge: 30, a: 16.0, b: 545 },
  { maxAge: 60, a: 14.2, b: 593 },
  { maxAge: 200, a: 13.5, b: 514 },
];

const HENRY_WOMEN: Array<{ maxAge: number; a: number; b: number }> = [
  { maxAge: 18, a: 11.1, b: 761 },
  { maxAge: 30, a: 13.1, b: 558 },
  { maxAge: 60, a: 9.74, b: 694 },
  { maxAge: 200, a: 10.1, b: 569 },
];

/**
 * Schofield (1985) weight + height BMR equations (kcal/day), FAO/WHO/UNU table.
 * `w` weight (kg), `h` height (m). BMR = w·weight + h·heightMeters + c.
 */
const SCHOFIELD_HW_MEN: Array<{ maxAge: number; w: number; h: number; c: number }> = [
  { maxAge: 30, w: 15.4, h: -27, c: 717 },
  { maxAge: 60, w: 11.3, h: 16, c: 901 },
  { maxAge: 200, w: 8.8, h: 1128, c: -1071 },
];

const SCHOFIELD_HW_WOMEN: Array<{ maxAge: number; w: number; h: number; c: number }> = [
  { maxAge: 30, w: 13.3, h: 334, c: 35 },
  { maxAge: 60, w: 8.7, h: -25, c: 865 },
  { maxAge: 200, w: 9.2, h: 637, c: -302 },
];

/**
 * Basal metabolic rate (kcal/day). `bodyFatPct` is only used by the lean-mass
 * based formulas (Katch-McArdle, Cunningham).
 */
export function computeBmr(
  formula: BmrFormulaId,
  inputs: PrescriptionInputs,
  bodyFatPct: number | null,
): number | null {
  const weight = num(inputs.weightKg);
  const height = num(inputs.heightCm);
  const age = num(inputs.ageYears);
  const female = isFemale(inputs.sex);

  switch (formula) {
    case "mifflin": {
      if (weight == null || height == null || age == null) return null;
      const base = 10 * weight + 6.25 * height - 5 * age;
      return Math.round(base + (female ? -161 : 5));
    }
    case "harris_benedict": {
      if (weight == null || height == null || age == null) return null;
      const value = female
        ? 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age
        : 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
      return Math.round(value);
    }
    case "who": {
      if (weight == null || age == null) return null;
      const bands = female ? WHO_WOMEN : WHO_MEN;
      const band = bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1];
      if (!band) return null;
      return Math.round(band.a * weight + band.b);
    }
    case "henry_oxford": {
      if (weight == null || age == null) return null;
      const bands = female ? HENRY_WOMEN : HENRY_MEN;
      const band = bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1];
      if (!band) return null;
      return Math.round(band.a * weight + band.b);
    }
    case "schofield": {
      if (weight == null || height == null || age == null) return null;
      const bands = female ? SCHOFIELD_HW_WOMEN : SCHOFIELD_HW_MEN;
      const band = bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1];
      if (!band) return null;
      return Math.round(band.w * weight + band.h * (height / 100) + band.c);
    }
    case "owen": {
      if (weight == null) return null;
      return Math.round(female ? 7.18 * weight + 795 : 10.2 * weight + 879);
    }
    case "ten_haaf": {
      if (weight == null || height == null || age == null) return null;
      const sexTerm = female ? 0 : 1;
      const value = 11.936 * weight + 587.728 * (height / 100) - 8.129 * age + 191.027 * sexTerm + 29.279;
      return Math.round(value);
    }
    case "katch_mcardle": {
      if (weight == null || bodyFatPct == null) return null;
      const lbm = weight * (1 - bodyFatPct / 100);
      if (lbm <= 0) return null;
      return Math.round(370 + 21.6 * lbm);
    }
    case "cunningham": {
      if (weight == null || bodyFatPct == null) return null;
      const lbm = weight * (1 - bodyFatPct / 100);
      if (lbm <= 0) return null;
      return Math.round(500 + 22 * lbm);
    }
    default:
      return null;
  }
}

// ── Physical activity level & energy expenditure ─────────────────────────────

export type PalOption = { key: string; label: string; value: number };

/** IOM/DRI PAL categories; representative multipliers per band. */
export const PAL_OPTIONS: PalOption[] = [
  { key: "sedentary", label: "Sedentary", value: 1.2 },
  { key: "low_active", label: "Low Active", value: 1.495 },
  { key: "active", label: "Active", value: 1.745 },
  { key: "very_active", label: "Very Active", value: 2.2 },
];

export const DEFAULT_PAL_KEY = "low_active";

export function palValue(key: string): number | null {
  return PAL_OPTIONS.find((option) => option.key === key)?.value ?? null;
}

/** Total daily energy expenditure = BMR x PAL (kcal/day). */
export function computeTdee(bmr: number | null, palKey: string): number | null {
  const pal = palValue(palKey);
  if (bmr == null || pal == null) return null;
  return Math.round(bmr * pal);
}

// ── Daily energy formula selector ────────────────────────────────────────────

export type EnergyFormulaId = "bmr_pal" | "eer_iom";

export const ENERGY_FORMULAS: Array<{ id: EnergyFormulaId; label: string }> = [
  { id: "bmr_pal", label: "BMR × activity level" },
  { id: "eer_iom", label: "EER (IOM 2005)" },
];

export const DEFAULT_ENERGY_FORMULA: EnergyFormulaId = "bmr_pal";

/** Map a numeric PAL to the IOM (2005) physical-activity coefficient. */
function iomPhysicalActivity(pal: number, female: boolean): number {
  if (pal < 1.4) return 1.0;
  if (pal < 1.6) return female ? 1.12 : 1.11;
  if (pal < 1.9) return female ? 1.27 : 1.25;
  return female ? 1.45 : 1.48;
}

/**
 * Estimated Energy Requirement for adults (IOM/DRI 2005), kcal/day.
 * `palNumeric` selects the PA coefficient band.
 */
export function computeEer(inputs: PrescriptionInputs, palNumeric: number | null): number | null {
  const weight = num(inputs.weightKg);
  const heightCm = num(inputs.heightCm);
  const age = num(inputs.ageYears);
  const pal = num(palNumeric);
  if (weight == null || heightCm == null || age == null || pal == null) return null;
  const heightM = heightCm / 100;
  const female = isFemale(inputs.sex);
  const pa = iomPhysicalActivity(pal, female);
  const value = female
    ? 354 - 6.91 * age + pa * (9.36 * weight + 726 * heightM)
    : 662 - 9.53 * age + pa * (15.91 * weight + 539.6 * heightM);
  return Math.round(value);
}

// ── Macronutrient distribution ───────────────────────────────────────────────

export const KCAL_PER_GRAM = { fat: 9, carbohydrate: 4, protein: 4 } as const;

/** IOM Acceptable Macronutrient Distribution Ranges (% of energy). */
export const AMDR = {
  fat: { min: 20, max: 35 },
  carbohydrate: { min: 45, max: 65 },
  protein: { min: 10, max: 35 },
} as const;

export const DEFAULT_MACRO_SPLIT = { fatPct: 30, carbPct: 50, proteinPct: 20 } as const;

export type MacroGrams = {
  fatG: number | null;
  carbohydrateG: number | null;
  proteinG: number | null;
};

/** Convert an energy target + percentage split into grams. */
export function macroGramsFromEnergy(
  energyKcal: number | null,
  split: { fatPct: number | null; carbPct: number | null; proteinPct: number | null },
): MacroGrams {
  const energy = num(energyKcal);
  const gramsFor = (pct: number | null, kcalPerGram: number): number | null => {
    const p = num(pct);
    if (energy == null || p == null) return null;
    return round((energy * (p / 100)) / kcalPerGram, 0);
  };
  return {
    fatG: gramsFor(split.fatPct, KCAL_PER_GRAM.fat),
    carbohydrateG: gramsFor(split.carbPct, KCAL_PER_GRAM.carbohydrate),
    proteinG: gramsFor(split.proteinPct, KCAL_PER_GRAM.protein),
  };
}

/** Grams per kg of body weight, e.g. protein 1.5 g/kg. */
export function gramsPerKg(grams: number | null, weightKg: number | null): number | null {
  const g = num(grams);
  const w = num(weightKg);
  if (g == null || w == null || w <= 0) return null;
  return round(g / w, 2);
}

// ── Dietary fiber ─────────────────────────────────────────────────────────────

// ── Fiber references ─────────────────────────────────────────────────────────

export type FiberSourceId = "iom" | "sacn" | "anses" | "sinu" | "nhmrc";

export const FIBER_SOURCES: Array<{ id: FiberSourceId; label: string; note: string }> = [
  { id: "iom", label: "IOM / FNB 2005", note: "14 g / 1000 kcal" },
  { id: "sacn", label: "SACN 2015", note: "30 g / day" },
  { id: "anses", label: "ANSES 2016", note: "30 g / day" },
  { id: "sinu", label: "SINU 2014", note: "25 g / day" },
  { id: "nhmrc", label: "NHMRC 2006 (2017)", note: "30 g men / 25 g women" },
];

export const DEFAULT_FIBER_SOURCE: FiberSourceId = "iom";

/**
 * Reference daily fiber intake by authority. IOM scales with energy
 * (14 g / 1000 kcal); the others are fixed adequate-intake targets.
 */
export function fiberReferenceG(
  source: string,
  energyKcal: number | null,
  sex: PrescriptionSex | null | undefined,
): number | null {
  switch (source as FiberSourceId) {
    case "sacn":
    case "anses":
      return 30;
    case "sinu":
      return 25;
    case "nhmrc":
      return sex === "FEMALE" ? 25 : 30;
    case "iom":
    default: {
      const energy = num(energyKcal);
      if (energy == null || energy <= 0) return null;
      return round((energy / 1000) * 14, 1);
    }
  }
}

// ── Activity / MET builder (factorial PAL method) ────────────────────────────

export type ActivityMet = { key: string; label: string; group: string; met: number };

/**
 * Curated MET values from the Compendium of Physical Activities (Ainsworth 2011).
 * Used by the activity builder to derive PAL as the time-weighted average MET.
 */
export const ACTIVITY_CATALOG: ActivityMet[] = [
  { key: "sleep", label: "Sleeping", group: "Rest", met: 0.95 },
  { key: "lying", label: "Lying / resting quietly", group: "Rest", met: 1.3 },
  { key: "sitting", label: "Sitting quietly", group: "Rest", met: 1.3 },
  { key: "tv", label: "Watching TV / reading (sitting)", group: "Rest", met: 1.3 },
  { key: "self_care", label: "Showering, dressing, grooming", group: "Personal care", met: 2.0 },
  { key: "eating", label: "Eating (sitting)", group: "Personal care", met: 1.5 },
  { key: "office", label: "Desk / office work (sitting)", group: "Occupation", met: 1.5 },
  { key: "standing_light", label: "Standing light work", group: "Occupation", met: 3.0 },
  { key: "manual_light", label: "Light manual work", group: "Occupation", met: 3.5 },
  { key: "cooking", label: "Cooking / food prep", group: "Household", met: 3.3 },
  { key: "cleaning_light", label: "Light cleaning (dusting, tidying)", group: "Household", met: 2.5 },
  { key: "cleaning_heavy", label: "Vacuuming / mopping", group: "Household", met: 3.3 },
  { key: "laundry", label: "Laundry", group: "Household", met: 2.0 },
  { key: "driving", label: "Driving a car", group: "Transport", met: 2.5 },
  { key: "commute_walk", label: "Walking to commute (3 mph)", group: "Transport", met: 3.3 },
  { key: "commute_bike", label: "Cycling to commute", group: "Transport", met: 6.8 },
  { key: "walk_slow", label: "Walking, slow (2 mph)", group: "Walking", met: 2.8 },
  { key: "walk_moderate", label: "Walking, moderate (3 mph)", group: "Walking", met: 3.5 },
  { key: "walk_brisk", label: "Walking, brisk (4 mph)", group: "Walking", met: 5.0 },
  { key: "stretching", label: "Stretching / light exercise", group: "Exercise", met: 2.5 },
  { key: "resistance", label: "Resistance training (moderate)", group: "Exercise", met: 5.0 },
  { key: "cycling", label: "Cycling (moderate)", group: "Exercise", met: 8.0 },
  { key: "swimming", label: "Swimming (moderate)", group: "Exercise", met: 7.0 },
  { key: "running", label: "Running (6 mph)", group: "Exercise", met: 9.8 },
  { key: "other", label: "Other (custom MET)", group: "Other", met: 2.0 },
];

export function activityMet(key: string): number | null {
  return ACTIVITY_CATALOG.find((a) => a.key === key)?.met ?? null;
}

export type ActivityEntry = { key: string; met: number | null; minutes: number | null };

/** Time-weighted average MET over the logged period ≈ physical activity level. */
export function palFromActivities(entries: ActivityEntry[]): number | null {
  let metMinutes = 0;
  let minutes = 0;
  for (const entry of entries) {
    const met = num(entry.met);
    const min = num(entry.minutes);
    if (met == null || min == null || min <= 0) continue;
    metMinutes += met * min;
    minutes += min;
  }
  if (minutes <= 0) return null;
  const pal = metMinutes / minutes;
  return round(Math.max(1, Math.min(3, pal)), 3);
}

export function totalActivityMinutes(entries: ActivityEntry[]): number {
  return entries.reduce((sum, entry) => sum + (num(entry.minutes) ?? 0), 0);
}

// ── Macro strategy presets ───────────────────────────────────────────────────

export type MacroPreset = {
  key: string;
  label: string;
  hint: string;
  fatPct: number;
  carbPct: number;
  proteinPct: number;
};

export const MACRO_PRESETS: MacroPreset[] = [
  { key: "balanced", label: "Balanced", hint: "General healthy eating", fatPct: 30, carbPct: 50, proteinPct: 20 },
  { key: "high_protein", label: "High protein", hint: "Muscle gain / satiety", fatPct: 30, carbPct: 40, proteinPct: 30 },
  { key: "low_carb", label: "Low carb", hint: "Weight loss / glycaemic control", fatPct: 40, carbPct: 25, proteinPct: 35 },
  { key: "mediterranean", label: "Mediterranean", hint: "Heart-healthy, higher fat", fatPct: 35, carbPct: 45, proteinPct: 20 },
  { key: "endurance", label: "Endurance", hint: "High training volume", fatPct: 25, carbPct: 55, proteinPct: 20 },
];

/** Protein % of energy implied by a g/kg prescription. */
export function proteinPctFromPerKg(
  perKg: number | null,
  weightKg: number | null,
  energyKcal: number | null,
): number | null {
  const g = num(perKg);
  const w = num(weightKg);
  const energy = num(energyKcal);
  if (g == null || w == null || energy == null || energy <= 0) return null;
  const kcal = g * w * KCAL_PER_GRAM.protein;
  return round(Math.min(100, (kcal / energy) * 100), 0);
}
