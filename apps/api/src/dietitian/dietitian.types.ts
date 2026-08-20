import type { SubscriptionAccessSnapshot } from "../entitlements/subscription-lifecycle.service";

export type DietitianAccountStatusView = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/** Practice tenant context — DietitianAccount only. */
export interface DietitianTenantContext {
  userId: string;
  dietitianAccountId: string;
  displayName: string;
  accountStatus: DietitianAccountStatusView;
  subscriptionAccess?: SubscriptionAccessSnapshot;
}

export const DIETITIAN_ACCESS_DENIED = "Dietitian account access denied";
export const DIETITIAN_UNAVAILABLE = "This dietitian account is not available";
