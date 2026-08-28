export const OPENAPI_PATH = "api/docs";

export const HEALTH_PATH = "/health";

export const API_V1_PREFIX = "api/v1";

export const SESSION_COOKIE_NAME = "ns_session";

export const INTERNAL_UNITS = {
  weight: "kg",
  height: "cm",
  mass: "g",
  volume: "ml",
  energy: "kcal",
} as const;

export const DISPLAY_WEIGHT_UNITS = ["kg", "lb"] as const;
export const DISPLAY_HEIGHT_UNITS = ["cm", "in"] as const;
export const DISPLAY_ENERGY_UNITS = ["kcal", "kj"] as const;
export const DATE_FORMATS = ["YYYY_MM_DD", "DD_MM_YYYY", "MM_DD_YYYY"] as const;
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "AED",
  "SAR",
  "LBP",
] as const;

export const PLATFORM_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

export const PLAN_SLUGS = ["standard", "pro", "premium"] as const;

export const FEATURE_KEYS = {
  AI: "AI",
  AI_REQUEST_LIMIT: "AI_REQUEST_LIMIT",
  CLIENT_LIMIT: "CLIENT_LIMIT",
  AUTOMATION: "AUTOMATION",
  AUTOMATION_RULE_LIMIT: "AUTOMATION_RULE_LIMIT",
  AUTOMATION_EXECUTION_LIMIT: "AUTOMATION_EXECUTION_LIMIT",
  /** Plan-display capabilities (marketing / plan matrix). Not all are runtime-gated. */
  DASHBOARD: "DASHBOARD",
  CLIENTS: "CLIENTS",
  MESSAGING: "MESSAGING",
  MEAL_PLANS: "MEAL_PLANS",
  MEAL_LIBRARY: "MEAL_LIBRARY",
  FOODS: "FOODS",
  HABITS: "HABITS",
  TRACKING: "TRACKING",
  APPOINTMENTS: "APPOINTMENTS",
  ASSESSMENTS: "ASSESSMENTS",
  DOCUMENTS: "DOCUMENTS",
  INVOICES: "INVOICES",
  TASKS: "TASKS",
  ANALYTICS: "ANALYTICS",
} as const;

/** Preferred public Plans page feature order. */
export const PLAN_FEATURE_DISPLAY_ORDER: readonly string[] = [
  FEATURE_KEYS.DASHBOARD,
  FEATURE_KEYS.CLIENTS,
  FEATURE_KEYS.CLIENT_LIMIT,
  FEATURE_KEYS.MESSAGING,
  FEATURE_KEYS.MEAL_PLANS,
  FEATURE_KEYS.MEAL_LIBRARY,
  FEATURE_KEYS.FOODS,
  FEATURE_KEYS.HABITS,
  FEATURE_KEYS.TRACKING,
  FEATURE_KEYS.APPOINTMENTS,
  FEATURE_KEYS.ASSESSMENTS,
  FEATURE_KEYS.DOCUMENTS,
  FEATURE_KEYS.INVOICES,
  FEATURE_KEYS.TASKS,
  FEATURE_KEYS.ANALYTICS,
  FEATURE_KEYS.AI,
  FEATURE_KEYS.AI_REQUEST_LIMIT,
  FEATURE_KEYS.AUTOMATION,
  FEATURE_KEYS.AUTOMATION_RULE_LIMIT,
  FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT,
];

export const FEATURE_VALUE_TYPES = ["BOOLEAN", "LIMIT"] as const;

export const CATALOG_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
] as const;

/** Derived practice access windows after currentPeriodEnd (UTC hours, not calendar midnights). */
export const SUBSCRIPTION_GRACE_DAYS = 3;
export const SUBSCRIPTION_READ_ONLY_DAYS = 7;

export const DIETITIAN_ACCESS_STATES = ["ACTIVE", "GRACE", "READ_ONLY", "LOCKED"] as const;

export const CLIENT_LIMIT_BY_PLAN_SLUG = {
  standard: 25,
  pro: 100,
  premium: 300,
} as const;

export const THROTTLE_NAMES = {
  AUTH: "auth",
  MESSAGING: "messaging",
  UPLOAD: "upload",
  AI: "ai",
} as const;

export const DEFAULT_AUTH_TOKEN_SECRET_PLACEHOLDER = "change-me-to-a-long-random-secret-value";
