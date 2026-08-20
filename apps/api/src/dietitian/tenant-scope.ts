import { ForbiddenException } from "@nestjs/common";
import { CLIENT_ACCESS_DENIED } from "../clients/client.messages";

/**
 * Tenant-owned queries must always include dietitianAccountId.
 * UUIDs are not a security boundary.
 */
export function tenantWhere(dietitianAccountId: string): { dietitianAccountId: string } {
  return { dietitianAccountId };
}

/** Require a client's dietitianAccountId for clinical auth filters. */
export function requireDietitianAccountId(client: { dietitianAccountId: string | null }): string {
  if (!client.dietitianAccountId) {
    throw new ForbiddenException(CLIENT_ACCESS_DENIED);
  }
  return client.dietitianAccountId;
}
