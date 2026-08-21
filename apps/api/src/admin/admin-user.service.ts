import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, UserStatus } from "@prisma/client";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { AdminActor } from "./admin-actor";
import { ADMIN_MESSAGES } from "./admin.messages";

type ListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
  scope?: "app" | "platform" | "all";
  type?: "dietitian" | "patient" | "all";
  status?: UserStatus;
};

@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const scope = query.scope ?? "app";
    const type = query.type ?? "all";

    const filters: Prisma.UserWhereInput[] = [];

    if (query.q) {
      filters.push({
        OR: [
          { email: { contains: query.q, mode: "insensitive" } },
          { emailNormalized: { contains: query.q.toLowerCase() } },
        ],
      });
    }

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (scope === "platform") {
      filters.push({ platformRole: { in: ["ADMIN", "SUPER_ADMIN"] } });
    } else if (scope === "app") {
      filters.push({ platformRole: null });
      if (type === "dietitian") {
        filters.push({ dietitianAccount: { isNot: null } });
      } else if (type === "patient") {
        filters.push({ clientAccounts: { some: {} } });
      } else {
        filters.push({
          OR: [{ dietitianAccount: { isNot: null } }, { clientAccounts: { some: {} } }],
        });
      }
    }

    const where: Prisma.UserWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          dietitianAccount: { select: { id: true, displayName: true, status: true } },
          clientAccounts: {
            take: 1,
            select: { id: true, client: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: users.map((user) => this.toListItem(user)),
    };
  }

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        dietitianAccount: true,
        clientAccounts: {
          take: 5,
          select: {
            id: true,
            status: true,
            dietitianAccount: { select: { id: true, displayName: true } },
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(ADMIN_MESSAGES.userNotFound);
    }

    return {
      ...this.toListItem(user),
      dietitianAccount: user.dietitianAccount
        ? {
            id: user.dietitianAccount.id,
            displayName: user.dietitianAccount.displayName,
            slug: user.dietitianAccount.slug,
            status: user.dietitianAccount.status,
          }
        : null,
      clientAccounts: user.clientAccounts.map((account) => ({
        id: account.id,
        status: account.status,
        practiceName: account.dietitianAccount.displayName,
        practiceId: account.dietitianAccount.id,
        clientName: [account.client.firstName, account.client.lastName].filter(Boolean).join(" "),
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

  async updateProfile(
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string;
      password?: string;
    },
    actor: AdminActor,
  ) {
    const user = await this.requireUser(userId);
    const data: Prisma.UserUpdateInput = {};

    if (input.firstName !== undefined) {
      data.firstName = input.firstName?.trim() ? input.firstName.trim() : null;
    }
    if (input.lastName !== undefined) {
      data.lastName = input.lastName?.trim() ? input.lastName.trim() : null;
    }

    if (input.email !== undefined) {
      const email = input.email.trim();
      const emailNormalized = normalizeEmail(email);
      if (emailNormalized !== user.emailNormalized) {
        const existing = await this.prisma.user.findUnique({ where: { emailNormalized } });
        if (existing && existing.id !== user.id) {
          throw new BadRequestException(ADMIN_MESSAGES.userAlreadyExists);
        }
        data.email = email;
        data.emailNormalized = emailNormalized;
      }
    }

    let passwordChanged = false;
    if (input.password !== undefined && input.password.length > 0) {
      this.passwords.assertPolicy(input.password);
      data.passwordHash = await this.passwords.hash(input.password);
      passwordChanged = true;
    }

    if (Object.keys(data).length === 0) {
      return this.toPublic(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });

    if (passwordChanged) {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.security.record({
      type: "admin_user_profile_updated",
      outcome: "success",
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
      targetType: "user",
      targetId: userId,
      metadata: {
        emailChanged: Boolean(data.email),
        passwordChanged,
        nameChanged: data.firstName !== undefined || data.lastName !== undefined,
      },
    });

    return this.toPublic(updated);
  }

  async setPlatformRole(userId: string, platformRole: "ADMIN" | null, actor: AdminActor) {
    const user = await this.requireUser(userId);

    if (user.platformRole && platformRole === null) {
      const remaining = await this.prisma.user.count({
        where: {
          platformRole: { in: ["ADMIN", "SUPER_ADMIN"] },
          id: { not: userId },
        },
      });
      if (remaining === 0) {
        throw new BadRequestException(ADMIN_MESSAGES.lastPlatformAdmin);
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
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

  private accountType(user: {
    platformRole: string | null;
    dietitianAccount: unknown;
    clientAccounts: unknown[];
  }): "admin" | "dietitian" | "patient" | "both" | "none" {
    if (user.platformRole) return "admin";
    const isDietitian = Boolean(user.dietitianAccount);
    const isPatient = user.clientAccounts.length > 0;
    if (isDietitian && isPatient) return "both";
    if (isDietitian) return "dietitian";
    if (isPatient) return "patient";
    return "none";
  }

  private toListItem(user: {
    id: string;
    email: string;
    status: string;
    platformRole: string | null;
    emailVerifiedAt: Date | null;
    createdAt: Date;
    suspendedAt: Date | null;
    archivedAt: Date | null;
    firstName?: string | null;
    lastName?: string | null;
    dietitianAccount: { id: string; displayName: string; status: string } | null;
    clientAccounts: Array<{ id: string; client?: { firstName: string; lastName: string } | null }>;
  }) {
    return {
      ...this.toPublic(user),
      accountType: this.accountType(user),
      displayName:
        user.dietitianAccount?.displayName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        [user.clientAccounts[0]?.client?.firstName, user.clientAccounts[0]?.client?.lastName]
          .filter(Boolean)
          .join(" ") ||
        null,
    };
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
    firstName?: string | null;
    lastName?: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      status: user.status,
      platformRole: user.platformRole ? "ADMIN" : null,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      archivedAt: user.archivedAt?.toISOString() ?? null,
    };
  }
}
