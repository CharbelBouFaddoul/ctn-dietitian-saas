import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientAccessService } from "../clients/client-access.service";
import { MULTI_MEMBER_UNSUPPORTED } from "../organizations/organization.service";

@Injectable()
export class ClientAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
  ) {}

  async list(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: tenant.organizationId },
      include: { user: true },
    });
    if (!account) {
      return [];
    }
    return [
      {
        id: account.id,
        membershipId: account.id,
        email: account.user.email,
        assignedAt: account.createdAt.toISOString(),
        unassignedAt: null,
        active: true,
      },
    ];
  }

  async assign(_tenant: TenantContext, _clientId: string, _organizationMemberId: string) {
    throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
  }
}
