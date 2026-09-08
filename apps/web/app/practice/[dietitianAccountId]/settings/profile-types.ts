export const PROFILE_TABS = [
  { id: "profile", label: "Personal data" },
  { id: "practice", label: "Clinic" },
  { id: "clinical", label: "Care" },
  { id: "documents", label: "Documents" },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

const PROFILE_TAB_ALIASES: Record<string, ProfileTabId> = {
  appearance: "profile",
  account: "profile",
  preferences: "practice",
  appointments: "clinical",
  portal: "clinical",
};

export function resolveProfileTab(value: string | null): ProfileTabId {
  if (value && PROFILE_TABS.some((tab) => tab.id === value)) return value as ProfileTabId;
  if (value && value in PROFILE_TAB_ALIASES) return PROFILE_TAB_ALIASES[value]!;
  return "profile";
}

export const PROFILE_FORM_ID = "profile-hub-form";
export const PROFILE_PASSWORD_FORM_ID = "profile-password-form";

export type ProfileEditorMode = {
  editing: boolean;
  saving: boolean;
  onSaved: () => void;
  onSaving: (saving: boolean) => void;
};

export const DATE_FORMAT_OPTIONS = [
  { value: "YYYY_MM_DD", label: "YYYY-MM-DD" },
  { value: "DD_MM_YYYY", label: "DD/MM/YYYY" },
  { value: "MM_DD_YYYY", label: "MM/DD/YYYY" },
];

export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "AED", "SAR", "LBP"];

export const MEAL_PLAN_SHARE_SECTIONS = [
  { id: "client", label: "Client information" },
  { id: "meals", label: "Meal plan" },
  { id: "recommendations", label: "Recommendations" },
  { id: "recipes", label: "Recipes" },
  { id: "signature", label: "Signature" },
] as const;

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

export type DietitianSettings = {
  timezone: string;
  locale: string;
  currency: string;
  weightUnit: string;
  heightUnit: string;
  dateFormat: string;
  practiceName: string | null;
  logoStorageKey: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  defaultAppointmentMinutes: number;
  reminderEmailEnabled: boolean;
  reminderHoursBefore: number;
  invoiceDefaultDueDays: number;
  invoiceDefaultTaxPercent: number;
  invoiceFooter: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  energyUnit: string;
  defaultAppointmentStatus: string;
  appointmentReminders: number[];
  mealPlanShare: MealPlanShare;
  enabledMeasurements: string[] | null;
  deduceMeasurements: boolean;
  defaultNutritionMethod: "iom" | "faculty_lebanon";
  portalPresets: PortalPresets;
  productEmailEnabled: boolean;
};

export type DietitianProfile = {
  id: string;
  name: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  professionalTitle: string | null;
  specialization: string | null;
  country: string | null;
  licenseNumber: string | null;
  photoStorageKey: string | null;
};

export function settingsPayload(settings: DietitianSettings): Record<string, unknown> {
  const { productEmailEnabled: _productEmailEnabled, ...payload } = settings;
  return payload;
}
