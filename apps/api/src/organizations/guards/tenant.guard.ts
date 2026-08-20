import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { SubscriptionLifecycleService } from "../../entitlements/subscription-lifecycle.service";
import {
  SUBSCRIPTION_LOCKED,
  SUBSCRIPTION_READ_ONLY,
} from "../../entitlements/subscription.messages";
import { ORGANIZATION_ACCESS_DENIED, ORGANIZATION_UNAVAILABLE } from "../tenant.types";
import type { TenantContext } from "../tenant.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Phase 2: DietitianAccount ownership is the only practice authorization gate.
 * Phase 4: also attaches derived subscription access and enforces LOCKED / READ_ONLY.
 * Path `:organizationId` is DietitianAccount.id. No OrganizationMember / OrgRoles.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionLifecycleService,
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

    const access = await this.lifecycle.getAccessForAccount(account.id);
    const allowLockedRead =
      req.method === "GET" &&
      typeof req.path === "string" &&
      req.path.endsWith("/subscription-access");

    if (access.accessState === "LOCKED" && !allowLockedRead) {
      throw new ForbiddenException(SUBSCRIPTION_LOCKED);
    }

    if (access.accessState === "READ_ONLY" && !SAFE_METHODS.has(req.method)) {
      throw new ForbiddenException(SUBSCRIPTION_READ_ONLY);
    }

    const tenant: TenantContext = {
      userId: user.id,
      organizationId: account.id,
      organizationName: account.displayName,
      organizationStatus: account.status,
      // Synthetic response fields only — not used for authorization.
      membershipId: account.id,
      role: "OWNER",
      membershipStatus: "ACTIVE",
      legacyOrganizationId: account.legacyOrganizationId ?? account.id,
      subscriptionAccess: access,
    };

    req.tenant = tenant;
    return true;
  }
}
