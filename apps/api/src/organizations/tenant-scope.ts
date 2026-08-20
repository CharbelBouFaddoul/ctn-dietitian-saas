import { ForbiddenException } from "@nestjs/common";
import { CLIENT_ACCESS_DENIED } from "../clients/client.messages";

/**
 * Tenant-owned queries must always include dietitianAccountId.
 * UUIDs are not a security boundary.
 *
 * Phase 1: the path param `:organizationId` and TenantContext.organizationId
 * hold the DietitianAccount.id (OWNER accounts reuse the legacy Organization.id).
 */
export function tenantWhere(dietitianAccountId: string): { dietitianAccountId: string } {
  return { dietitianAccountId };
}

/** Legacy organization_id column value for forensics on new writes. */
export function legacyOrganizationId(tenant: {
  organizationId: string;
  legacyOrganizationId?: string | null;
}): string {
  return tenant.legacyOrganizationId ?? tenant.organizationId;
}

/** Require a client's dietitianAccountId for clinical auth filters. */
export function requireDietitianAccountId(client: { dietitianAccountId: string | null }): string {
  if (!client.dietitianAccountId) {
    throw new ForbiddenException(CLIENT_ACCESS_DENIED);
  }
  return client.dietitianAccountId;
}
