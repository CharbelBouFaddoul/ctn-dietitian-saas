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

export const ORGANIZATION_ROLES = ["OWNER", "DIETITIAN", "STAFF"] as const;

export const PLATFORM_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

export const PLAN_SLUGS = ["standard", "pro", "premium"] as const;

export const FEATURE_KEYS = {
  AI: "AI",
  AI_REQUEST_LIMIT: "AI_REQUEST_LIMIT",
  CLIENT_LIMIT: "CLIENT_LIMIT",
  AUTOMATION: "AUTOMATION",
  AUTOMATION_RULE_LIMIT: "AUTOMATION_RULE_LIMIT",
  AUTOMATION_EXECUTION_LIMIT: "AUTOMATION_EXECUTION_LIMIT",
} as const;

export const FEATURE_VALUE_TYPES = ["BOOLEAN", "LIMIT"] as const;

export const CATALOG_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
] as const;

export const THROTTLE_NAMES = {
  AUTH: "auth",
  MESSAGING: "messaging",
  UPLOAD: "upload",
  AI: "ai",
} as const;

export const DEFAULT_AUTH_TOKEN_SECRET_PLACEHOLDER = "change-me-to-a-long-random-secret-value";
