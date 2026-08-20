import { ForbiddenException, Injectable } from "@nestjs/common";
import type { DietitianAccount, DietitianAccountStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { ORGANIZATION_UNAVAILABLE } from "./tenant.types";

@Injectable()
export class OrganizationLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  isOperable(status: DietitianAccountStatus | string): boolean {
    return status === "ACTIVE";
  }

  assertOperable(status: DietitianAccountStatus | string): void {
    if (!this.isOperable(status)) {
      throw new ForbiddenException(ORGANIZATION_UNAVAILABLE);
    }
  }

  async setStatus(
    dietitianAccountId: string,
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED",
    actorUserId?: string,
  ): Promise<DietitianAccount> {
    const data = {
      status: status as DietitianAccountStatus,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
      suspendedAt: status === "SUSPENDED" ? new Date() : null,
    };

    const account = await this.prisma.dietitianAccount.update({
      where: { id: dietitianAccountId },
      data,
    });

    if (account.legacyOrganizationId) {
      await this.prisma.organization.updateMany({
        where: { id: account.legacyOrganizationId },
        data: {
          status,
          archivedAt: data.archivedAt,
          suspendedAt: data.suspendedAt,
        },
      });
    }

    await this.security.record({
      type: "organization_status_changed",
      outcome: "success",
      organizationId: dietitianAccountId,
      dietitianAccountId,
      userId: actorUserId,
      reason: status,
    });

    return account;
  }
}
