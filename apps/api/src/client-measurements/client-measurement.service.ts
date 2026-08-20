import { BadRequestException, Injectable } from "@nestjs/common";
import { INTERNAL_UNITS } from "@nutrition-saas/config";
import type { MeasurementType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { legacyOrganizationId, tenantWhere } from "../organizations/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";

const INTERNAL_BY_TYPE: Record<MeasurementType, string> = {
  WEIGHT: INTERNAL_UNITS.weight,
  HEIGHT: INTERNAL_UNITS.height,
  WAIST: INTERNAL_UNITS.height,
  HIPS: INTERNAL_UNITS.height,
  BODY_FAT: "%",
  MUSCLE_MASS: INTERNAL_UNITS.weight,
};

@Injectable()
export class ClientMeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.clientMeasurement.findMany({
      where: { clientId, ...tenantWhere(tenant.organizationId) },
      orderBy: { measuredAt: "desc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async create(
    tenant: TenantContext,
    clientId: string,
    input: { type: MeasurementType; value: number; unit: string; measuredAt: string; notes?: string },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const internalUnit = INTERNAL_BY_TYPE[input.type];
    const value = this.toInternal(input.type, input.value, input.unit);
    const row = await this.prisma.clientMeasurement.create({
      data: {
        dietitianAccountId: tenant.organizationId,
        organizationId: legacyOrganizationId(tenant),
        clientId,
        type: input.type,
        value,
        unit: internalUnit,
        measuredAt: new Date(input.measuredAt),
        recordedById: tenant.userId,
        notes: input.notes?.trim() ?? null,
      },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      legacyOrganizationId: legacyOrganizationId(tenant),
      clientId,
      type: "MEASUREMENT_ADDED",
      actorUserId: tenant.userId,
      targetType: "measurement",
      targetId: row.id,
      metadata: { measurementType: input.type, unit: internalUnit },
    });
    await this.security.record({
      type: "measurement_added",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "measurement",
      targetId: row.id,
      metadata: { measurementType: input.type },
    });
    return this.toResponse(row);
  }

  toInternal(type: MeasurementType, value: number, unit: string): number {
    const normalized = unit.toLowerCase();
    if (type === "WEIGHT" || type === "MUSCLE_MASS") {
      if (normalized === "kg") {
        return value;
      }
      if (normalized === "lb") {
        return value * 0.45359237;
      }
    }
    if (type === "HEIGHT" || type === "WAIST" || type === "HIPS") {
      if (normalized === "cm") {
        return value;
      }
      if (normalized === "in") {
        return value * 2.54;
      }
    }
    if (type === "BODY_FAT" && (normalized === "%" || normalized === "percent")) {
      return value;
    }
    throw new BadRequestException("Unsupported measurement unit");
  }

  private toResponse(row: {
    id: string;
    type: MeasurementType;
    value: unknown;
    unit: string;
    measuredAt: Date;
    notes: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      type: row.type,
      value: Number(row.value),
      unit: row.unit,
      measuredAt: row.measuredAt.toISOString(),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
