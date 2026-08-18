import type { MembershipStatus, OrganizationRole, OrganizationStatus } from "@nutrition-saas/types";

export interface TenantContext {
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationStatus: OrganizationStatus;
  membershipId: string;
  role: OrganizationRole;
  membershipStatus: MembershipStatus;
}

export const ORGANIZATION_ACCESS_DENIED = "Organization access denied";
export const ORGANIZATION_UNAVAILABLE = "This organization is not available";
