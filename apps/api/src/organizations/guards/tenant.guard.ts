import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { tenantWhere } from "../tenant-scope";
import { OrganizationLifecycleService } from "../organization-lifecycle.service";
import { ORGANIZATION_ACCESS_DENIED } from "../tenant.types";
import type { TenantContext } from "../tenant.types";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrganizationLifecycleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    const organizationId = req.params.organizationId;

    if (!user) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }

    if (typeof organizationId !== "string" || organizationId.length === 0) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        ...tenantWhere(organizationId),
        userId: user.id,
        status: "ACTIVE",
      },
      include: { organization: true },
    });

    if (!membership) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }

    this.lifecycle.assertOperable(membership.organization.status);

    const tenant: TenantContext = {
      userId: user.id,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      organizationStatus: membership.organization.status,
      membershipId: membership.id,
      role: membership.role,
      membershipStatus: membership.status,
    };

    req.tenant = tenant;
    return true;
  }
}
