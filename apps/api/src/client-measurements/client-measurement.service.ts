import { BadRequestException, Injectable } from "@nestjs/common";
import { INTERNAL_UNITS } from "@nutrition-saas/config";
import type { MeasurementType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
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

export type MeasurementListFilters = {
  type?: MeasurementType;
  from?: string;
  to?: string;
};

/** Inclusive day bounds for YYYY-MM-DD; otherwise parse as full timestamp. */
function parseMeasuredAtBound(value: string, endOfDay: boolean): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(endOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${endOfDay ? "to" : "from"} must be a valid date`);
  }
  return parsed;
}

@Injectable()
export class ClientMeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async list(tenant: DietitianTenantContext, clientId: string, filters: MeasurementListFilters = {}) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    return this.listScoped(tenant.dietitianAccountId, clientId, filters);
  }

  async evolution(tenant: DietitianTenantContext, clientId: string, filters: MeasurementListFilters = {}) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    return this.evolutionScoped(tenant.dietitianAccountId, clientId, filters);
  }

  /** Portal / internal: already ownership-checked. */
  async listScoped(dietitianAccountId: string, clientId: string, filters: MeasurementListFilters = {}) {
    const measuredAt =
      filters.from || filters.to
        ? {
            ...(filters.from ? { gte: parseMeasuredAtBound(filters.from, false) } : {}),
            ...(filters.to ? { lte: parseMeasuredAtBound(filters.to, true) } : {}),
          }
        : undefined;
    const rows = await this.prisma.clientMeasurement.findMany({
      where: {
        clientId,
        ...tenantWhere(dietitianAccountId),
        ...(filters.type ? { type: filters.type } : {}),
        ...(measuredAt ? { measuredAt } : {}),
      },
      orderBy: { measuredAt: "desc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async evolutionScoped(dietitianAccountId: string, clientId: string, filters: MeasurementListFilters = {}) {
    const rows = await this.listScoped(dietitianAccountId, clientId, {
      from: filters.from,
      to: filters.to,
    });
    const ascending = [...rows].sort(
      (a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime(),
    );

    const seriesByType: Record<string, Array<{ at: string; value: number; unit: string; id: string }>> = {};
    for (const row of ascending) {
      if (!seriesByType[row.type]) seriesByType[row.type] = [];
      seriesByType[row.type]!.push({
        id: row.id,
        at: row.measuredAt,
        value: row.value,
        unit: row.unit,
      });
    }

    const heights = seriesByType.HEIGHT ?? [];
    const weights = seriesByType.WEIGHT ?? [];
    const bmiSeries: Array<{ at: string; value: number; unit: string }> = [];
    for (const w of weights) {
      const height = latestAtOrBefore(heights, w.at);
      if (!height) continue;
      const bmi = computeBmi(w.value, w.unit, height.value, height.unit);
      if (bmi == null) continue;
      bmiSeries.push({ at: w.at, value: bmi, unit: "kg/m²" });
    }

    const comparison = {
      weight: compareEndpoints(seriesByType.WEIGHT ?? []),
      height: compareEndpoints(seriesByType.HEIGHT ?? []),
      bmi: compareEndpoints(bmiSeries.map((p, i) => ({ ...p, id: `bmi-${i}` }))),
      available: (seriesByType.WEIGHT?.length ?? 0) >= 2 || bmiSeries.length >= 2,
    };

    const latestByType: Record<string, { value: number; unit: string; measuredAt: string } | null> = {};
    for (const type of Object.keys(seriesByType)) {
      const series = seriesByType[type]!;
      const last = series[series.length - 1];
      latestByType[type] = last
        ? { value: last.value, unit: last.unit, measuredAt: last.at }
        : null;
    }
    const previousByType: Record<string, { value: number; unit: string; measuredAt: string } | null> = {};
    for (const type of Object.keys(seriesByType)) {
      const series = seriesByType[type]!;
      const prev = series.length >= 2 ? series[series.length - 2] : null;
      previousByType[type] = prev
        ? { value: prev.value, unit: prev.unit, measuredAt: prev.at }
        : null;
    }

    return {
      series: seriesByType,
      bmiSeries,
      latest: latestByType,
      previous: previousByType,
      comparison,
      from: filters.from ?? null,
      to: filters.to ?? null,
    };
  }

  async create(
    tenant: DietitianTenantContext,
    clientId: string,
    input: { type: MeasurementType; value: number; unit: string; measuredAt: string; notes?: string },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    return this.createScoped(tenant.dietitianAccountId, clientId, tenant.userId, input);
  }

  /** Portal: ownership already checked via assertPortalAccess. */
  async createForPortal(
    client: { id: string; dietitianAccountId: string },
    actorUserId: string,
    input: { type: MeasurementType; value: number; unit: string; measuredAt?: string; notes?: string },
  ) {
    return this.createScoped(client.dietitianAccountId, client.id, actorUserId, {
      type: input.type,
      value: input.value,
      unit: input.unit,
      measuredAt: input.measuredAt ?? new Date().toISOString(),
      notes: input.notes,
    });
  }

  private async createScoped(
    dietitianAccountId: string,
    clientId: string,
    actorUserId: string,
    input: { type: MeasurementType; value: number; unit: string; measuredAt: string; notes?: string },
  ) {
    const internalUnit = INTERNAL_BY_TYPE[input.type];
    const value = this.toInternal(input.type, input.value, input.unit);
    const measuredAt = new Date(input.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) {
      throw new BadRequestException("measuredAt must be a valid timestamp");
    }
    const row = await this.prisma.clientMeasurement.create({
      data: {
        dietitianAccountId,
        clientId,
        type: input.type,
        value,
        unit: internalUnit,
        measuredAt,
        recordedById: actorUserId,
        notes: input.notes?.trim() ?? null,
      },
    });
    await this.timeline.record({
      dietitianAccountId,
      clientId,
      type: "MEASUREMENT_ADDED",
      actorUserId,
      targetType: "measurement",
      targetId: row.id,
      metadata: { measurementType: input.type, unit: internalUnit },
    });
    await this.security.record({
      type: "measurement_added",
      outcome: "success",
      userId: actorUserId,
      dietitianAccountId,
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

function latestAtOrBefore(
  points: Array<{ at: string; value: number; unit: string }>,
  at: string,
): { at: string; value: number; unit: string } | null {
  const t = new Date(at).getTime();
  let best: { at: string; value: number; unit: string } | null = null;
  for (const p of points) {
    const pt = new Date(p.at).getTime();
    if (pt <= t) best = p;
  }
  return best;
}

function compareEndpoints(points: Array<{ at: string; value: number; unit: string; id?: string }>) {
  if (points.length < 2) {
    return null;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const absolute = Math.round((last.value - first.value) * 1000) / 1000;
  const percent =
    first.value !== 0 ? Math.round(((last.value - first.value) / Math.abs(first.value)) * 1000) / 10 : null;
  return {
    baseline: { value: first.value, unit: first.unit, measuredAt: first.at },
    current: { value: last.value, unit: last.unit, measuredAt: last.at },
    absolute,
    percent,
  };
}

/** BMI from kg + cm when units allow; null otherwise. */
export function computeBmi(
  weight: number | null,
  weightUnit: string | null,
  height: number | null,
  heightUnit: string | null,
): number | null {
  if (weight == null || height == null || weight <= 0 || height <= 0) return null;
  let kg = weight;
  let cm = height;
  const wu = (weightUnit ?? "kg").toLowerCase();
  const hu = (heightUnit ?? "cm").toLowerCase();
  if (wu === "lb" || wu === "lbs") kg = weight * 0.453592;
  if (hu === "in" || hu === "inch" || hu === "inches") cm = height * 2.54;
  else if (hu === "m" || hu === "meter" || hu === "metres" || hu === "meters") cm = height * 100;
  if (kg <= 0 || cm <= 0) return null;
  const m = cm / 100;
  const bmi = kg / (m * m);
  if (!Number.isFinite(bmi)) return null;
  return Math.round(bmi * 10) / 10;
}
