import type { MembershipStatus, OrganizationRole, OrganizationStatus } from "@nutrition-saas/types";
import type { SubscriptionAccessSnapshot } from "../entitlements/subscription-lifecycle.service";

/**
 * Phase 2 tenant context.
 * `organizationId` is the DietitianAccount.id (API path compatibility).
 *
 * `membershipId` / `role` / `membershipStatus` are synthetic response fields only
 * (always account id + OWNER + ACTIVE). They are not used for authorization.
 */
export interface TenantContext {
  userId: string;
  /** DietitianAccount.id */
  organizationId: string;
  organizationName: string;
  organizationStatus: OrganizationStatus;
  /** Synthetic: DietitianAccount.id (API/response compatibility). */
  membershipId: string;
  /** Synthetic: always OWNER (API/response compatibility). */
  role: OrganizationRole;
  /** Synthetic: always ACTIVE (API/response compatibility). */
  membershipStatus: MembershipStatus;
  /** Legacy Organization.id when known (forensics writes). */
  legacyOrganizationId?: string | null;
  /** Phase 4 derived subscription access (set by TenantGuard). */
  subscriptionAccess?: SubscriptionAccessSnapshot;
}

export const ORGANIZATION_ACCESS_DENIED = "Organization access denied";
export const ORGANIZATION_UNAVAILABLE = "This organization is not available";
