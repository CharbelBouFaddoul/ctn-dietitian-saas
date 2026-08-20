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
import {
  DIETITIAN_ACCESS_DENIED,
  DIETITIAN_UNAVAILABLE,
  type DietitianTenantContext,
} from "../dietitian.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Phase 7: DietitianAccount ownership is the only practice authorization gate.
 * Phase 4 lifecycle: LOCKED / READ_ONLY enforced via SubscriptionLifecycleService.
 * Path `:dietitianAccountId` is DietitianAccount.id. No OrganizationMember.
 */
@Injectable()
export class DietitianGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    const dietitianAccountId = req.params.dietitianAccountId;

    if (!user) {
      throw new ForbiddenException(DIETITIAN_ACCESS_DENIED);
    }

    if (typeof dietitianAccountId !== "string" || dietitianAccountId.length === 0) {
      throw new ForbiddenException(DIETITIAN_ACCESS_DENIED);
    }

    const account = await this.prisma.dietitianAccount.findFirst({
      where: {
        id: dietitianAccountId,
        userId: user.id,
      },
    });

    if (!account) {
      throw new ForbiddenException(DIETITIAN_ACCESS_DENIED);
    }

    if (account.status !== "ACTIVE") {
      throw new ForbiddenException(DIETITIAN_UNAVAILABLE);
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

    const tenant: DietitianTenantContext = {
      userId: user.id,
      dietitianAccountId: account.id,
      displayName: account.displayName,
      accountStatus: account.status,
      subscriptionAccess: access,
    };

    req.tenant = tenant;
    return true;
  }
}
