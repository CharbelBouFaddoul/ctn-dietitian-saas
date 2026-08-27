const TEXT_MAX = 4000;
const CODE_MAX = 80;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ClinicalData = {
  visit: {
    reason: string;
    expectations: string;
    clinicalAims: string;
    clinicalAimsNotes: string;
    other: string;
  };
  lifestyle: {
    bowelHabits: string;
    bowelHabitsNotes: string;
    sleepQuality: string;
    sleepQualityNotes: string;
    smoking: string;
    smokingNotes: string;
    alcohol: string;
    alcoholNotes: string;
    maritalStatus: string;
    maritalStatusNotes: string;
    physicalActivity: string;
    physicalActivityNotes: string;
    background: string;
    other: string;
  };
  health: {
    conditions: string;
    conditionsNotes: string;
    medication: string;
    personalHistory: string;
    familyHistory: string;
    other: string;
  };
  eating: {
    usualWakeTime: string;
    usualBedTime: string;
    dietTypes: string;
    dietTypesNotes: string;
    preferredFoods: string;
    dislikedFoods: string;
    allergies: string;
    allergiesNotes: string;
    intolerances: string;
    intolerancesNotes: string;
  };
  nutrition: {
    deficiencies: string;
    deficienciesNotes: string;
    waterIntake: string;
    other: string;
    targets: {
      energyKcal: number | null;
      fatG: number | null;
      carbohydrateG: number | null;
      proteinG: number | null;
      fiberG: number | null;
    };
  };
  identity: {
    occupation: string;
    workplace: string;
    processNumber: string;
    healthNumber: string;
    nationalNumber: string;
    vatNumber: string;
    country: string;
    zipCode: string;
    address: string;
  };
};

function text(value: unknown, max = TEXT_MAX): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function code(value: unknown): string {
  return text(value, CODE_MAX);
}

function time(value: unknown): string {
  const raw = text(value, 5);
  return TIME_RE.test(raw) ? raw : "";
}

function positiveNumber(value: unknown, max = 20000): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

export function emptyClinicalData(): ClinicalData {
  return {
    visit: { reason: "", expectations: "", clinicalAims: "", clinicalAimsNotes: "", other: "" },
    lifestyle: {
      bowelHabits: "",
      bowelHabitsNotes: "",
      sleepQuality: "",
      sleepQualityNotes: "",
      smoking: "",
      smokingNotes: "",
      alcohol: "",
      alcoholNotes: "",
      maritalStatus: "",
      maritalStatusNotes: "",
      physicalActivity: "",
      physicalActivityNotes: "",
      background: "",
      other: "",
    },
    health: {
      conditions: "",
      conditionsNotes: "",
      medication: "",
      personalHistory: "",
      familyHistory: "",
      other: "",
    },
    eating: {
      usualWakeTime: "",
      usualBedTime: "",
      dietTypes: "",
      dietTypesNotes: "",
      preferredFoods: "",
      dislikedFoods: "",
      allergies: "",
      allergiesNotes: "",
      intolerances: "",
      intolerancesNotes: "",
    },
    nutrition: {
      deficiencies: "",
      deficienciesNotes: "",
      waterIntake: "",
      other: "",
      targets: {
        energyKcal: null,
        fatG: null,
        carbohydrateG: null,
        proteinG: null,
        fiberG: null,
      },
    },
    identity: {
      occupation: "",
      workplace: "",
      processNumber: "",
      healthNumber: "",
      nationalNumber: "",
      vatNumber: "",
      country: "",
      zipCode: "",
      address: "",
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function sanitizeClinicalData(input: unknown): ClinicalData {
  const root = asRecord(input);
  const visit = asRecord(root.visit);
  const lifestyle = asRecord(root.lifestyle);
  const health = asRecord(root.health);
  const eating = asRecord(root.eating);
  const nutrition = asRecord(root.nutrition);
  const identity = asRecord(root.identity);
  return {
    visit: {
      reason: text(visit.reason),
      expectations: text(visit.expectations),
      clinicalAims: code(visit.clinicalAims),
      clinicalAimsNotes: text(visit.clinicalAimsNotes),
      other: text(visit.other),
    },
    lifestyle: {
      bowelHabits: code(lifestyle.bowelHabits),
      bowelHabitsNotes: text(lifestyle.bowelHabitsNotes),
      sleepQuality: code(lifestyle.sleepQuality),
      sleepQualityNotes: text(lifestyle.sleepQualityNotes),
      smoking: code(lifestyle.smoking),
      smokingNotes: text(lifestyle.smokingNotes),
      alcohol: code(lifestyle.alcohol),
      alcoholNotes: text(lifestyle.alcoholNotes),
      maritalStatus: code(lifestyle.maritalStatus),
      maritalStatusNotes: text(lifestyle.maritalStatusNotes),
      physicalActivity: code(lifestyle.physicalActivity),
      physicalActivityNotes: text(lifestyle.physicalActivityNotes),
      background: code(lifestyle.background),
      other: text(lifestyle.other),
    },
    health: {
      conditions: code(health.conditions),
      conditionsNotes: text(health.conditionsNotes),
      medication: text(health.medication),
      personalHistory: text(health.personalHistory),
      familyHistory: text(health.familyHistory),
      other: text(health.other),
    },
    eating: {
      usualWakeTime: time(eating.usualWakeTime),
      usualBedTime: time(eating.usualBedTime),
      dietTypes: code(eating.dietTypes),
      dietTypesNotes: text(eating.dietTypesNotes),
      preferredFoods: text(eating.preferredFoods),
      dislikedFoods: text(eating.dislikedFoods),
      allergies: code(eating.allergies),
      allergiesNotes: text(eating.allergiesNotes),
      intolerances: code(eating.intolerances),
      intolerancesNotes: text(eating.intolerancesNotes),
    },
    nutrition: {
      deficiencies: code(nutrition.deficiencies),
      deficienciesNotes: text(nutrition.deficienciesNotes),
      waterIntake: code(nutrition.waterIntake),
      other: text(nutrition.other),
      targets: (() => {
        const targets = asRecord(nutrition.targets);
        return {
          energyKcal: positiveNumber(targets.energyKcal, 20000),
          fatG: positiveNumber(targets.fatG, 1000),
          carbohydrateG: positiveNumber(targets.carbohydrateG, 2000),
          proteinG: positiveNumber(targets.proteinG, 1000),
          fiberG: positiveNumber(targets.fiberG, 200),
        };
      })(),
    },
    identity: {
      occupation: text(identity.occupation, 120),
      workplace: text(identity.workplace, 120),
      processNumber: text(identity.processNumber, 80),
      healthNumber: text(identity.healthNumber, 80),
      nationalNumber: text(identity.nationalNumber, 80),
      vatNumber: text(identity.vatNumber, 80),
      country: text(identity.country, 80),
      zipCode: text(identity.zipCode, 40),
      address: text(identity.address, 400),
    },
  };
}

export function migrateLegacyIntoClinical(profile: {
  clinicalData?: unknown;
  nutritionContext?: string | null;
  preferences?: string | null;
  dietaryPreferences?: string | null;
  allergies?: string | null;
  intolerances?: string | null;
  lifestyle?: string | null;
  notes?: string | null;
}): { data: ClinicalData; persisted: boolean } {
  if (profile.clinicalData && typeof profile.clinicalData === "object" && !Array.isArray(profile.clinicalData) && "visit" in profile.clinicalData) {
    return { data: sanitizeClinicalData(profile.clinicalData), persisted: false };
  }
  const data = emptyClinicalData();
  data.nutrition.other = profile.nutritionContext?.trim() ?? "";
  data.eating.preferredFoods = profile.preferences?.trim() ?? "";
  data.eating.dietTypesNotes = profile.dietaryPreferences?.trim() ?? "";
  data.eating.allergiesNotes = profile.allergies?.trim() ?? "";
  data.eating.intolerancesNotes = profile.intolerances?.trim() ?? "";
  data.lifestyle.other = profile.lifestyle?.trim() ?? "";
  data.visit.other = profile.notes?.trim() ?? "";
  const hasLegacy = Boolean(
    data.nutrition.other ||
      data.eating.preferredFoods ||
      data.eating.dietTypesNotes ||
      data.eating.allergiesNotes ||
      data.eating.intolerancesNotes ||
      data.lifestyle.other ||
      data.visit.other,
  );
  return { data, persisted: hasLegacy };
}
