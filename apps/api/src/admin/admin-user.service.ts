import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";

@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(search?: string) {
    const users = await this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { emailNormalized: { contains: search.toLowerCase() } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return users.map((user) => this.toPublic(user));
  }

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(ADMIN_MESSAGES.userNotFound);
    }

    return {
      ...this.toPublic(user),
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        organizationSlug: membership.organization.slug,
        role: membership.role,
        status: membership.status,
      })),
    };
  }

  async setStatus(userId: string, status: Exclude<UserStatus, "PENDING">, actor: AdminActor) {
    const user = await this.requireUser(userId);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status,
        suspendedAt: status === "SUSPENDED" ? new Date() : null,
        archivedAt: status === "ARCHIVED" ? new Date() : null,
      },
    });

    if (status !== "ACTIVE") {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.security.record({
      type: "admin_user_status_changed",
      outcome: "success",
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "user",
      targetId: userId,
      metadata: { status },
    });

    return this.toPublic(updated);
  }

  async setPlatformRole(
    userId: string,
    platformRole: "SUPER_ADMIN" | "ADMIN" | null,
    actor: AdminActor,
  ) {
    const user = await this.requireUser(userId);

    if (user.platformRole === "SUPER_ADMIN" && platformRole !== "SUPER_ADMIN") {
      const remaining = await this.prisma.user.count({
        where: { platformRole: "SUPER_ADMIN", id: { not: userId } },
      });
      if (remaining === 0) {
        throw new BadRequestException(ADMIN_MESSAGES.lastSuperAdmin);
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { platformRole },
    });

    await this.security.record({
      type: "admin_platform_role_changed",
      outcome: "success",
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "user",
      targetId: userId,
      metadata: { platformRole },
    });

    return this.toPublic(updated);
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(ADMIN_MESSAGES.userNotFound);
    }
    return user;
  }

  private toPublic(user: {
    id: string;
    email: string;
    status: string;
    platformRole: string | null;
    emailVerifiedAt: Date | null;
    createdAt: Date;
    suspendedAt: Date | null;
    archivedAt: Date | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      platformRole: user.platformRole,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      archivedAt: user.archivedAt?.toISOString() ?? null,
    };
  }
}
