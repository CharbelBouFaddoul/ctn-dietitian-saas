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

export const PLAN_SLUGS = ["trial", "standard", "pro", "premium"] as const;

export const FEATURE_KEYS = {
  AI: "AI",
  AI_REQUEST_LIMIT: "AI_REQUEST_LIMIT",
  AI_TOKEN_LIMIT: "AI_TOKEN_LIMIT",
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
  FEATURE_KEYS.AI_TOKEN_LIMIT,
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
  trial: 10,
  standard: 40,
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

/** USD per 1M tokens. Unknown models use gpt-4o-mini so estimates never go blank. */
export const AI_MODEL_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

export const AI_DEFAULT_MODEL_PRICE = AI_MODEL_PRICES_USD_PER_MILLION["gpt-4o-mini"]!;

export function estimateAiCostMicros(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = (model && AI_MODEL_PRICES_USD_PER_MILLION[model]) || AI_DEFAULT_MODEL_PRICE;
  const usd = (Math.max(0, inputTokens) / 1_000_000) * price.input + (Math.max(0, outputTokens) / 1_000_000) * price.output;
  return Math.round(usd * 1_000_000);
}

export function microsToUsd(micros: number | bigint): number {
  return Number(micros) / 1_000_000;
}
