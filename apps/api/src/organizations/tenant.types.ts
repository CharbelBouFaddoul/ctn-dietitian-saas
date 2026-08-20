import type { MembershipStatus, OrganizationRole, OrganizationStatus } from "@nutrition-saas/types";

/**
 * Phase 1 tenant context.
 * `organizationId` is the DietitianAccount.id (API path compatibility).
 * Account owners are exposed as role OWNER (no STAFF/multi-member runtime).
 */
export interface TenantContext {
  userId: string;
  /** DietitianAccount.id */
  organizationId: string;
  organizationName: string;
  organizationStatus: OrganizationStatus;
  /** Same as DietitianAccount.id in Phase 1 (no membership row). */
  membershipId: string;
  role: OrganizationRole;
  membershipStatus: MembershipStatus;
  /** Legacy Organization.id when known (forensics writes). */
  legacyOrganizationId?: string | null;
}

export const ORGANIZATION_ACCESS_DENIED = "Organization access denied";
export const ORGANIZATION_UNAVAILABLE = "This organization is not available";
