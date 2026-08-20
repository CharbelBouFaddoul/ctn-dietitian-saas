import type { SubscriptionAccessSnapshot } from "../entitlements/subscription-lifecycle.service";

export type DietitianAccountStatusView = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/** Phase 7 practice tenant context — DietitianAccount only. */
export interface DietitianTenantContext {
  userId: string;
  dietitianAccountId: string;
  displayName: string;
  accountStatus: DietitianAccountStatusView;
  subscriptionAccess?: SubscriptionAccessSnapshot;
}

/** @deprecated Use DietitianTenantContext */
export type TenantContext = DietitianTenantContext;

export const DIETITIAN_ACCESS_DENIED = "Dietitian account access denied";
export const DIETITIAN_UNAVAILABLE = "This dietitian account is not available";

export const ORGANIZATION_ACCESS_DENIED = DIETITIAN_ACCESS_DENIED;
export const ORGANIZATION_UNAVAILABLE = DIETITIAN_UNAVAILABLE;
