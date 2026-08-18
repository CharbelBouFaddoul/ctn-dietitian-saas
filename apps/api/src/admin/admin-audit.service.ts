import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: { q?: string; action?: string; organizationId?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.q
        ? {
            OR: [
              { action: { contains: filters.q, mode: "insensitive" } },
              { targetType: { contains: filters.q, mode: "insensitive" } },
              { targetId: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: { actor: true, organization: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      result: log.result,
      targetType: log.targetType,
      targetId: log.targetId,
      requestId: log.requestId,
      metadata: log.metadata,
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor
        ? { id: log.actor.id, email: log.actor.email, platformRole: log.actor.platformRole }
        : null,
      organization: log.organization
        ? { id: log.organization.id, name: log.organization.name, slug: log.organization.slug }
        : null,
    }));
  }
}
