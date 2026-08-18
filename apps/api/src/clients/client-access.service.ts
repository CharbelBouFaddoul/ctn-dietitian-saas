import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Client, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { tenantWhere } from "../organizations/tenant-scope";
import { CLIENT_ACCESS_DENIED, CLIENT_NOT_AVAILABLE } from "./client.messages";

export type ClientAction =
  | "read"
  | "update"
  | "archive"
  | "assign"
  | "invite"
  | "create"
  | "manageRecords";

const STAFF_FORBIDDEN: ClientAction[] = ["create", "archive", "assign", "invite"];

@Injectable()
export class ClientAccessService {
  constructor(private readonly prisma: PrismaService) {}

  assertCanCreate(tenant: TenantContext): void {
    if (tenant.role === "STAFF") {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
  }

  visibleWhere(tenant: TenantContext): Prisma.ClientWhereInput {
    const base: Prisma.ClientWhereInput = tenantWhere(tenant.organizationId);
    if (tenant.role === "OWNER") {
      return base;
    }
    return {
      ...base,
      assignments: {
        some: {
          organizationMemberId: tenant.membershipId,
          unassignedAt: null,
        },
      },
    };
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

    if (tenant.role !== "OWNER") {
      const assigned = await this.prisma.clientAssignment.findFirst({
        where: {
          clientId,
          organizationId: tenant.organizationId,
          organizationMemberId: tenant.membershipId,
          unassignedAt: null,
        },
      });
      if (!assigned) {
        throw new ForbiddenException(CLIENT_ACCESS_DENIED);
      }
    }

    if (tenant.role === "STAFF" && STAFF_FORBIDDEN.includes(action)) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }

    if (action !== "read" && action !== "archive" && (client.status === "ARCHIVED" || client.status === "INACTIVE")) {
      throw new ForbiddenException(CLIENT_NOT_AVAILABLE);
    }

    return client;
  }

  async assertPortalAccess(userId: string, clientId?: string): Promise<Client> {
    const account = await this.prisma.clientAccount.findUnique({
      where: { userId },
      include: { client: true },
    });
    if (!account || account.status !== "ACTIVE") {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    if (account.client.status !== "ACTIVE") {
      throw new ForbiddenException(CLIENT_NOT_AVAILABLE);
    }
    if (clientId && account.clientId !== clientId) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (membership) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
    return account.client;
  }
}
