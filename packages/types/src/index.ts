export type UserStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export type PlatformRole = "SUPER_ADMIN" | "ADMIN";

export type InvitationPurpose = "DIETITIAN_ACTIVATION" | "STAFF_INVITE" | "CLIENT_INVITE";

export type ConsentType = "TERMS_OF_SERVICE" | "PRIVACY_POLICY";

export interface PublicUser {
  id: string;
  email: string;
  status: UserStatus;
  platformRole: PlatformRole | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface PublicSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  activeClientId?: string | null;
}

export interface AuthMeResponse {
  user: PublicUser;
  session: PublicSession;
}

export type OrganizationStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export type OrganizationRole = "OWNER" | "DIETITIAN" | "STAFF";

export type MembershipStatus = "ACTIVE" | "DEACTIVATED";

export type WeightUnit = "kg" | "lb";

export type HeightUnit = "cm" | "in";

export type DateFormat = "YYYY_MM_DD" | "DD_MM_YYYY" | "MM_DD_YYYY";

export interface TenantContextView {
  dietitianAccountId: string;
  displayName: string;
  accountStatus: OrganizationStatus;
}

export interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: string;
}

export type CatalogStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type FeatureValueType = "BOOLEAN" | "LIMIT";

export type SubscriptionStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";

/** Derived practice access (not a persisted SubscriptionStatus). */
export type DietitianAccessState = "ACTIVE" | "GRACE" | "READ_ONLY" | "LOCKED";

export type EntitlementSource = "override" | "plan" | "default";

export interface EntitlementResult {
  enabled: boolean;
  limit: number | null;
  source: EntitlementSource;
}

export interface SubscriptionAccessView {
  accessState: DietitianAccessState;
  status: SubscriptionStatus | null;
  planSlug: string | null;
  planName: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  readOnlyEndsAt: string | null;
  daysRemainingInPhase: number | null;
  clientCount: number | null;
  clientLimit: number | null;
}

export type HealthCheckStatus = "up" | "down";

export interface HealthChecks {
  api: HealthCheckStatus;
  database: HealthCheckStatus;
  redis: HealthCheckStatus;
  storage: HealthCheckStatus;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  checks: HealthChecks;
  timestamp: string;
}
