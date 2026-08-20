import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Client, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { tenantWhere } from "../organizations/tenant-scope";
import {
  CLIENT_ACCESS_DENIED,
  CLIENT_NOT_AVAILABLE,
  PORTAL_CONNECTION_REQUIRED,
} from "./client.messages";

export type ClientAction =
  | "read"
  | "update"
  | "archive"
  | "assign"
  | "invite"
  | "create"
  | "manageRecords";

export type PortalAccessOptions = {
  /** Explicit client id override. */
  clientId?: string;
  /** Session.activeClientId when present. */
  activeClientId?: string | null;
  /**
   * When true (clinical ops), multiple ACTIVE connections without a selected
   * active client require the user to pick one. Onboarding may pass false.
   */
  requireSelection?: boolean;
};

@Injectable()
export class ClientAccessService {
  constructor(private readonly prisma: PrismaService) {}

  assertCanCreate(_tenant: TenantContext): void {
    // Phase 1: account owner only reaches TenantGuard; all actions allowed.
  }

  visibleWhere(tenant: TenantContext): Prisma.ClientWhereInput {
    return tenantWhere(tenant.organizationId);
  }

  async assertCanAccess(
    tenant: TenantContext,
    clientId: string,
    action: ClientAction = "read",
  ): Promise<Client> {
    if (action === "create") {
      this.assertCanCreate(tenant);
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, ...tenantWhere(tenant.organizationId) },
    });
    if (!client) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }

    if (action !== "read" && action !== "archive" && (client.status === "ARCHIVED" || client.status === "INACTIVE")) {
      throw new ForbiddenException(CLIENT_NOT_AVAILABLE);
    }

    return client;
  }

  async assertPortalAccess(userId: string, options: PortalAccessOptions = {}): Promise<Client> {
    const dietitianAccount = await this.prisma.dietitianAccount.findUnique({
      where: { userId },
    });
    if (dietitianAccount) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }

    const requireSelection = options.requireSelection ?? true;
    const preferredClientId = options.clientId ?? options.activeClientId ?? null;

    if (preferredClientId) {
      const account = await this.prisma.clientAccount.findFirst({
        where: { userId, clientId: preferredClientId, status: "ACTIVE" },
        include: { client: true },
      });
      if (!account) {
        throw new ForbiddenException(CLIENT_ACCESS_DENIED);
      }
      if (account.client.status !== "ACTIVE") {
        throw new ForbiddenException(CLIENT_NOT_AVAILABLE);
      }
      return account.client;
    }

    const accounts = await this.prisma.clientAccount.findMany({
      where: { userId, status: "ACTIVE" },
      include: { client: true },
      orderBy: { activatedAt: "asc" },
    });
    const usable = accounts.filter((row) => row.client.status === "ACTIVE");
    if (usable.length === 0) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    if (usable.length > 1 && requireSelection) {
      throw new ForbiddenException(PORTAL_CONNECTION_REQUIRED);
    }

    const account = usable[0];
    if (!account) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    return account.client;
  }
}
