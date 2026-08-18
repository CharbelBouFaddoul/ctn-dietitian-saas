import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Organization, OrganizationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { ORGANIZATION_UNAVAILABLE } from "./tenant.types";

@Injectable()
export class OrganizationLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  isOperable(status: OrganizationStatus): boolean {
    return status === "ACTIVE";
  }

  assertOperable(status: OrganizationStatus): void {
    if (!this.isOperable(status)) {
      throw new ForbiddenException(ORGANIZATION_UNAVAILABLE);
    }
  }

  async setStatus(
    organizationId: string,
    status: OrganizationStatus,
    actorUserId?: string,
  ): Promise<Organization> {
    const data: {
      status: OrganizationStatus;
      archivedAt: Date | null;
      suspendedAt: Date | null;
    } = {
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
      suspendedAt: status === "SUSPENDED" ? new Date() : null,
    };

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data,
    });

    await this.security.record({
      type: "organization_status_changed",
      outcome: "success",
      organizationId,
      userId: actorUserId,
      reason: status,
    });

    return organization;
  }
}
