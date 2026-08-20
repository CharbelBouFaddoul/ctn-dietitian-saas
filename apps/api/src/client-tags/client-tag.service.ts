import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { ClientAccessService } from "../clients/client-access.service";

@Injectable()
export class ClientTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
  ) {}

  async listTags(tenant: DietitianTenantContext) {
    return this.prisma.tag.findMany({
      where: tenantWhere(tenant.dietitianAccountId),
      orderBy: { name: "asc" },
    });
  }

  async createTag(tenant: DietitianTenantContext, name: string, color?: string) {
    try {
      return await this.prisma.tag.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          name: name.trim(),
          color: color ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Tag name already exists");
      }
      throw error;
    }
  }

  async setClientTags(tenant: DietitianTenantContext, clientId: string, tagIds: string[]) {
    await this.access.assertCanAccess(tenant, clientId, "update");
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds }, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (tags.length !== tagIds.length) {
      throw new NotFoundException("One or more tags are invalid");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.clientTag.deleteMany({ where: { clientId, ...tenantWhere(tenant.dietitianAccountId) } });
      if (tags.length > 0) {
        await tx.clientTag.createMany({
          data: tags.map((tag) => ({
            dietitianAccountId: tenant.dietitianAccountId,
            clientId,
            tagId: tag.id,
          })),
        });
      }
    });
    return this.prisma.clientTag.findMany({
      where: { clientId },
      include: { tag: true },
    });
  }
}
