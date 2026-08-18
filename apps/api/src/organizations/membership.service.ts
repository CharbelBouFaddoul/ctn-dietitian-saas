import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrganizationRole } from "@prisma/client";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { tenantWhere } from "./tenant-scope";
import { ORGANIZATION_ACCESS_DENIED } from "./tenant.types";
import { CLIENT_EMAIL_IN_USE } from "../clients/client.messages";

const LAST_OWNER_MESSAGE = "Organization must keep at least one OWNER";

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: tenantWhere(organizationId),
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt.toISOString(),
      deactivatedAt: member.deactivatedAt?.toISOString() ?? null,
    }));
  }

  async add(organizationId: string, actorUserId: string, email: string, role: "DIETITIAN" | "STAFF") {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: normalizeEmail(email) },
    });

    if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      throw new BadRequestException("User cannot be added");
    }

    const clientAccount = await this.prisma.clientAccount.findUnique({ where: { userId: user.id } });
    if (clientAccount) {
      throw new ConflictException(CLIENT_EMAIL_IN_USE);
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: user.id },
      },
    });

    if (existing?.status === "ACTIVE") {
      throw new ConflictException("Membership already exists");
    }

    const member = existing
      ? await this.prisma.organizationMember.update({
          where: { id: existing.id },
          data: {
            role,
            status: "ACTIVE",
            deactivatedAt: null,
            joinedAt: new Date(),
          },
        })
      : await this.prisma.organizationMember.create({
          data: {
            organizationId,
            userId: user.id,
            role,
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        });

    await this.security.record({
      type: existing ? "membership_created" : "membership_created",
      outcome: "success",
      userId: actorUserId,
      organizationId,
      reason: role,
    });

    return member;
  }

  async changeRole(
    organizationId: string,
    membershipId: string,
    role: OrganizationRole,
    actorUserId: string,
  ) {
    const member = await this.requireMember(organizationId, membershipId);

    if (member.role === "OWNER" && role !== "OWNER") {
      await this.assertNotLastOwner(organizationId, membershipId);
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { role },
    });

    await this.security.record({
      type: "role_changed",
      outcome: "success",
      userId: actorUserId,
      organizationId,
      reason: `${member.role}->${role}`,
    });

    return updated;
  }

  async deactivate(organizationId: string, membershipId: string, actorUserId: string) {
    const member = await this.requireMember(organizationId, membershipId);
    if (member.status !== "ACTIVE") {
      return member;
    }

    if (member.role === "OWNER") {
      await this.assertNotLastOwner(organizationId, membershipId);
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });

    await this.security.record({
      type: "membership_deactivated",
      outcome: "success",
      userId: actorUserId,
      organizationId,
    });

    return updated;
  }

  async transferOwnership(organizationId: string, fromMembershipId: string, toMembershipId: string) {
    if (fromMembershipId === toMembershipId) {
      throw new BadRequestException("Cannot transfer ownership to the same membership");
    }

    const source = await this.requireMember(organizationId, fromMembershipId);
    const target = await this.requireMember(organizationId, toMembershipId);

    if (source.role !== "OWNER") {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }
    if (target.status !== "ACTIVE") {
      throw new BadRequestException("Target membership is not active");
    }

    const [updatedTarget] = await this.prisma.$transaction([
      this.prisma.organizationMember.update({
        where: { id: target.id },
        data: { role: "OWNER" },
      }),
      this.prisma.organizationMember.update({
        where: { id: source.id },
        data: { role: "DIETITIAN" },
      }),
    ]);

    await this.security.record({
      type: "ownership_transferred",
      outcome: "success",
      userId: source.userId,
      organizationId,
      reason: target.userId,
    });

    return updatedTarget;
  }

  private async requireMember(organizationId: string, membershipId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { ...tenantWhere(organizationId), id: membershipId },
    });
    if (!member) {
      throw new NotFoundException("Membership not found");
    }
    return member;
  }

  private async assertNotLastOwner(organizationId: string, membershipId: string) {
    const owners = await this.prisma.organizationMember.count({
      where: { ...tenantWhere(organizationId), role: "OWNER", status: "ACTIVE" },
    });
    const member = await this.prisma.organizationMember.findFirst({
      where: { ...tenantWhere(organizationId), id: membershipId },
    });
    if (owners <= 1 && member?.role === "OWNER" && member.status === "ACTIVE") {
      throw new BadRequestException(LAST_OWNER_MESSAGE);
    }
  }
}
