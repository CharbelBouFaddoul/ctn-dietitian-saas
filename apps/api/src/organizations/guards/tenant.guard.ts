import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { ORGANIZATION_ACCESS_DENIED, ORGANIZATION_UNAVAILABLE } from "../tenant.types";
import type { TenantContext } from "../tenant.types";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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

    const account = await this.prisma.dietitianAccount.findFirst({
      where: {
        id: organizationId,
        userId: user.id,
      },
    });

    if (!account) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }

    if (account.status !== "ACTIVE") {
      throw new ForbiddenException(ORGANIZATION_UNAVAILABLE);
    }

    const tenant: TenantContext = {
      userId: user.id,
      organizationId: account.id,
      organizationName: account.displayName,
      organizationStatus: account.status,
      membershipId: account.id,
      role: "OWNER",
      membershipStatus: "ACTIVE",
      legacyOrganizationId: account.legacyOrganizationId ?? account.id,
    };

    req.tenant = tenant;
    return true;
  }
}
