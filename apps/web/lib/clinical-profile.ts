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

export type SelectOption = { value: string; label: string };

const NONE: SelectOption = { value: "", label: "Select an option" };

export const CLINICAL_AIM_OPTIONS: SelectOption[] = [
  NONE,
  { value: "weight_change", label: "Weight change" },
  { value: "energy", label: "Energy and vitality" },
  { value: "digestion", label: "Digestion" },
  { value: "sports", label: "Training and performance" },
  { value: "medical_support", label: "Condition support" },
  { value: "other", label: "Other" },
];

export const BOWEL_OPTIONS: SelectOption[] = [
  NONE,
  { value: "regular", label: "Regular" },
  { value: "irregular", label: "Irregular" },
  { value: "constipation", label: "Constipation" },
  { value: "loose", label: "Loose stools" },
  { value: "mixed", label: "Mixed" },
];

export const SLEEP_OPTIONS: SelectOption[] = [
  NONE,
  { value: "restful", label: "Restful" },
  { value: "fair", label: "Fair" },
  { value: "disrupted", label: "Disrupted" },
  { value: "insufficient", label: "Too little" },
];

export const SMOKING_OPTIONS: SelectOption[] = [
  NONE,
  { value: "never", label: "Never" },
  { value: "former", label: "Former" },
  { value: "occasional", label: "Occasional" },
  { value: "daily", label: "Daily" },
];

export const ALCOHOL_OPTIONS: SelectOption[] = [
  NONE,
  { value: "never", label: "None" },
  { value: "occasional", label: "Occasionally" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];

export const HOUSEHOLD_OPTIONS: SelectOption[] = [
  NONE,
  { value: "single", label: "Single" },
  { value: "partnered", label: "Partnered" },
  { value: "married", label: "Married" },
  { value: "separated", label: "Separated" },
  { value: "widowed", label: "Widowed" },
  { value: "prefer_not", label: "Prefer not to say" },
];

export const ACTIVITY_OPTIONS: SelectOption[] = [
  NONE,
  { value: "sedentary", label: "Mostly seated" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "vigorous", label: "Vigorous" },
];

export const BACKGROUND_OPTIONS: SelectOption[] = [
  NONE,
  { value: "prefer_not", label: "Prefer not to say" },
  { value: "other", label: "Recorded in notes" },
];

export const CONDITION_OPTIONS: SelectOption[] = [
  NONE,
  { value: "diabetes", label: "Diabetes" },
  { value: "thyroid", label: "Thyroid" },
  { value: "pcos", label: "PCOS" },
  { value: "hypertension", label: "Hypertension" },
  { value: "celiac", label: "Coeliac / celiac" },
  { value: "other", label: "Other" },
];

export const DIET_STYLE_OPTIONS: SelectOption[] = [
  NONE,
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "mediterranean", label: "Mediterranean-style" },
  { value: "low_carb", label: "Lower carbohydrate" },
  { value: "gluten_free", label: "Gluten-free" },
  { value: "other", label: "Other" },
];

export const ALLERGY_OPTIONS: SelectOption[] = [
  NONE,
  { value: "nuts", label: "Nuts" },
  { value: "dairy", label: "Dairy" },
  { value: "eggs", label: "Eggs" },
  { value: "gluten", label: "Gluten" },
  { value: "shellfish", label: "Shellfish" },
  { value: "soy", label: "Soy" },
  { value: "other", label: "Other" },
];

export const INTOLERANCE_OPTIONS: SelectOption[] = [
  NONE,
  { value: "lactose", label: "Lactose" },
  { value: "gluten", label: "Gluten" },
  { value: "fructose", label: "Fructose" },
  { value: "histamine", label: "Histamine" },
  { value: "other", label: "Other" },
];

export const DEFICIENCY_OPTIONS: SelectOption[] = [
  NONE,
  { value: "iron", label: "Iron" },
  { value: "vitamin_d", label: "Vitamin D" },
  { value: "b12", label: "Vitamin B12" },
  { value: "calcium", label: "Calcium" },
  { value: "other", label: "Other" },
];

export const WATER_OPTIONS: SelectOption[] = [
  NONE,
  { value: "under_1l", label: "Under 1 L" },
  { value: "about_1_2l", label: "About 1–2 L" },
  { value: "about_2_3l", label: "About 2–3 L" },
  { value: "over_3l", label: "Over 3 L" },
];

export const MEAL_SLOT_OPTIONS: SelectOption[] = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "SNACK", label: "Snack" },
];

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

export function mealSlotLabel(slot: string | null | undefined): string {
  return MEAL_SLOT_OPTIONS.find((item) => item.value === slot)?.label ?? "Meal";
}
