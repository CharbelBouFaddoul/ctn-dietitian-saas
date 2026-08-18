import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientAccessService } from "../clients/client-access.service";
import { CLIENT_ACCESS_DENIED } from "../clients/client.messages";

export interface ProfileInput {
  nutritionContext?: string | null;
  preferences?: string | null;
  dietaryPreferences?: string | null;
  allergies?: string | null;
  intolerances?: string | null;
  lifestyle?: string | null;
  notes?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

@Injectable()
export class ClientProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly security: SecurityEventLogger,
  ) {}

  async get(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const profile = await this.prisma.clientProfile.findUnique({ where: { clientId } });
    if (!profile) {
      throw new NotFoundException(CLIENT_ACCESS_DENIED);
    }
    return profile;
  }

  async update(tenant: TenantContext, clientId: string, input: ProfileInput) {
    await this.access.assertCanAccess(tenant, clientId, "update");
    const profile = await this.prisma.clientProfile.update({
      where: { clientId },
      data: {
        nutritionContext: input.nutritionContext,
        preferences: input.preferences,
        dietaryPreferences: input.dietaryPreferences,
        allergies: input.allergies,
        intolerances: input.intolerances,
        lifestyle: input.lifestyle,
        notes: input.notes,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
      },
    });
    await this.security.record({
      type: "client_profile_updated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "client",
      targetId: clientId,
    });
    return profile;
  }
}
