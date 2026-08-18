/**
 * Tenant-owned queries must always include organizationId.
 * UUIDs are not a security boundary.
 */
export function tenantWhere(organizationId: string): { organizationId: string } {
  return { organizationId };
}
