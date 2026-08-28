export const PROFILE_TABS = [
  { id: "profile", label: "Your profile" },
  { id: "practice", label: "Practice" },
  { id: "preferences", label: "Preferences" },
  { id: "appointments", label: "Appointments" },
  { id: "documents", label: "Documents" },
  { id: "clinical", label: "Clinical" },
  { id: "portal", label: "Client portal" },
  { id: "account", label: "Account" },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

export const PROFILE_FORM_ID = "profile-hub-form";

export type ProfileEditorMode = {
  editing: boolean;
  saving: boolean;
  onSaved: () => void;
  onSaving: (saving: boolean) => void;
};

export function isProfileTab(value: string | null): value is ProfileTabId {
  return PROFILE_TABS.some((tab) => tab.id === value);
}

export const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "Asia/Beirut",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Africa/Cairo",
  "Africa/Johannesburg",
];

export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-LB", label: "English (Lebanon)" },
  { value: "fr", label: "French" },
  { value: "ar", label: "Arabic" },
  { value: "ar-LB", label: "Arabic (Lebanon)" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
];

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
