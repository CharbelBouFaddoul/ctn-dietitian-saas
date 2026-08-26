import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientAccessService } from "../clients/client-access.service";
import { CLIENT_ACCESS_DENIED } from "../clients/client.messages";
import { tenantWhere } from "../dietitian/tenant-scope";
import { migrateLegacyIntoClinical, sanitizeClinicalData, type ClinicalData } from "./clinical-data";

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
  clinicalData?: unknown;
}

@Injectable()
export class ClientProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly security: SecurityEventLogger,
  ) {}

  async get(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    let profile = await this.prisma.clientProfile.findFirst({
      where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!profile) {
      const client = await this.prisma.client.findFirst({
        where: { id: clientId, ...tenantWhere(tenant.dietitianAccountId) },
        select: { id: true },
      });
      if (!client) throw new NotFoundException(CLIENT_ACCESS_DENIED);
      profile = await this.prisma.clientProfile.create({
        data: { clientId, dietitianAccountId: tenant.dietitianAccountId },
      });
    }
    const migrated = migrateLegacyIntoClinical(profile);
    if (migrated.persisted) {
      profile = await this.prisma.clientProfile.update({
        where: { clientId },
        data: { clinicalData: migrated.data as Prisma.InputJsonValue },
      });
    }
    return this.toResponse(profile, migrated.data);
  }

  async update(tenant: DietitianTenantContext, clientId: string, input: ProfileInput) {
    await this.access.assertCanAccess(tenant, clientId, "update");
    const existing = await this.prisma.clientProfile.findFirst({
      where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!existing) {
      throw new NotFoundException(CLIENT_ACCESS_DENIED);
    }
    const clinicalData =
      input.clinicalData === undefined
        ? undefined
        : (sanitizeClinicalData(input.clinicalData) as Prisma.InputJsonValue);
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
        ...(clinicalData !== undefined ? { clinicalData } : {}),
      },
    });
    await this.security.record({
      type: "client_profile_updated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "client",
      targetId: clientId,
    });
    return this.toResponse(profile, sanitizeClinicalData(profile.clinicalData));
  }

  private toResponse(
    profile: {
      id: string;
      nutritionContext: string | null;
      preferences: string | null;
      dietaryPreferences: string | null;
      allergies: string | null;
      intolerances: string | null;
      lifestyle: string | null;
      notes: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
      updatedAt: Date;
    },
    clinicalData: ClinicalData,
  ) {
    return {
      id: profile.id,
      nutritionContext: profile.nutritionContext,
      preferences: profile.preferences,
      dietaryPreferences: profile.dietaryPreferences,
      allergies: profile.allergies,
      intolerances: profile.intolerances,
      lifestyle: profile.lifestyle,
      notes: profile.notes,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      clinicalData,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
