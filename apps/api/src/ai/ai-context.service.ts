import { Injectable } from "@nestjs/common";
import { Prisma, type Client } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ClientAccessService } from "../clients/client-access.service";
import { labeledAssessmentAnswers } from "../assessments/assessment-schema";
import { migrateLegacyIntoClinical } from "../client-profiles/clinical-data";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";

type SnapshotDay = {
  dayNumber?: number;
  title?: string;
  nutrition?: { energyKcal?: number };
  meals?: Array<{ name?: string }>;
};

@Injectable()
export class AiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
  ) {}

  async buildSummaryContext(tenant: DietitianTenantContext, clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const [core, appointments, mealPlan, timeline] = await Promise.all([
      this.loadClinicalCore(tenant, clientId),
      this.prisma.appointment.findMany({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
        orderBy: { startAt: "desc" },
        take: 5,
      }),
      this.publishedPlan(tenant, clientId, "totals"),
      this.prisma.timelineEvent.findMany({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
        orderBy: { occurredAt: "desc" },
        take: 8,
        select: { type: true, occurredAt: true },
      }),
    ]);

    return this.normalizeClientBundle(client, {
      ...core,
      appointments: appointments.map((row) => ({
        title: row.title,
        status: row.status,
        startAt: row.startAt.toISOString(),
      })),
      activeMealPlan: mealPlan,
      recentTimeline: timeline.map((row) => ({ type: row.type, occurredAt: row.occurredAt.toISOString() })),
    });
  }

  async buildMealPlanContext(tenant: DietitianTenantContext, clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const [core, mealPlan] = await Promise.all([
      this.loadClinicalCore(tenant, clientId),
      this.publishedPlan(tenant, clientId, "items"),
    ]);
    return this.normalizeClientBundle(client, {
      ...core,
      activeMealPlan: mealPlan,
    });
  }

  async buildNutritionContext(tenant: DietitianTenantContext, clientId: string, foodQuery?: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const [core, mealPlan, foods] = await Promise.all([
      this.loadClinicalCore(tenant, clientId),
      this.publishedPlan(tenant, clientId, "totals"),
      foodQuery
        ? this.prisma.food.findMany({
            where: {
              name: { contains: foodQuery, mode: "insensitive" },
              status: "ACTIVE",
            },
            take: 5,
            select: {
              name: true,
              energyKcal: true,
              proteinG: true,
              carbohydrateG: true,
              fatG: true,
              fiberG: true,
            },
          })
        : Promise.resolve([]),
    ]);
    return this.normalizeClientBundle(client, {
      ...core,
      activeMealPlan: mealPlan,
      foods: foods.map((row) => ({
        name: row.name,
        energyKcal: row.energyKcal ? Number(row.energyKcal) : null,
        proteinG: row.proteinG ? Number(row.proteinG) : null,
        carbohydrateG: row.carbohydrateG ? Number(row.carbohydrateG) : null,
        fatG: row.fatG ? Number(row.fatG) : null,
        fiberG: row.fiberG ? Number(row.fiberG) : null,
      })),
    });
  }

  async buildMessageContext(tenant: DietitianTenantContext, clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const [core, messages] = await Promise.all([
      this.loadClinicalCore(tenant, clientId),
      this.prisma.message.findMany({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId), deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { body: true, createdAt: true },
      }),
    ]);
    return this.normalizeClientBundle(client, {
      ...core,
      recentMessages: messages.map((row) => ({
        excerpt: row.body.slice(0, 240),
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }

  /** @deprecated Use action-specific builders. Kept for tests that inspect summary shape. */
  async buildClientContext(tenant: DietitianTenantContext, clientId: string) {
    return this.buildSummaryContext(tenant, clientId);
  }

  private async loadClinicalCore(tenant: DietitianTenantContext, clientId: string) {
    const [profile, goals, measurements, assessments, notes] = await Promise.all([
      this.prisma.clientProfile.findUnique({ where: { clientId } }),
      this.prisma.clientGoal.findMany({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.clientMeasurement.findMany({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
        orderBy: { measuredAt: "desc" },
        take: 8,
      }),
      this.prisma.assessment.findMany({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId), responses: { not: Prisma.DbNull } },
        orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
        take: 3,
        include: { template: true },
      }),
      this.prisma.clientChartNote.findMany({
        where: {
          clientId,
          kind: { in: ["CLINICAL", "PREGNANCY", "EATING_HABIT"] },
          ...tenantWhere(tenant.dietitianAccountId),
        },
        orderBy: { notedAt: "desc" },
        take: 12,
        select: { kind: true, body: true, notedAt: true },
      }),
    ]);
    const clinical = clinicalForAi(profile);
    const prescription =
      clinical && typeof clinical === "object" && "prescription" in clinical
        ? (clinical as { prescription?: unknown }).prescription ?? null
        : null;
    return {
      profile: profileSlice(profile),
      clinical,
      prescription,
      evaluations: assessments
        .map((row) => {
          const answers = labeledAssessmentAnswers(row.schemaSnapshot ?? row.template.schema, row.responses);
          if (!answers.length) return null;
          return {
            name: row.template.name,
            status: row.status,
            completedAt: row.completedAt?.toISOString() ?? null,
            answers,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      clinicalNotes: notes
        .filter((row) => row.kind === "CLINICAL")
        .slice(0, 5)
        .map((row) => ({ excerpt: row.body.slice(0, 400), notedAt: row.notedAt.toISOString() })),
      pregnancyNotes: notes
        .filter((row) => row.kind === "PREGNANCY")
        .slice(0, 5)
        .map((row) => ({ excerpt: row.body.slice(0, 400), notedAt: row.notedAt.toISOString() })),
      eatingHabitNotes: notes
        .filter((row) => row.kind === "EATING_HABIT")
        .slice(0, 5)
        .map((row) => ({ excerpt: row.body.slice(0, 400), notedAt: row.notedAt.toISOString() })),
      goals: goals.map((row) => ({
        title: row.title,
        status: row.status,
        targetValue: row.targetValue ? Number(row.targetValue) : null,
        targetUnit: row.targetUnit,
      })),
      measurements: measurements.map((row) => ({
        type: row.type,
        value: Number(row.value),
        unit: row.unit,
        measuredAt: row.measuredAt.toISOString(),
      })),
    };
  }

  private async publishedPlan(
    tenant: DietitianTenantContext,
    clientId: string,
    mode: "totals" | "items",
  ) {
    if (mode === "items") {
      const mealPlan = await this.prisma.mealPlan.findFirst({
        where: { clientId, ...tenantWhere(tenant.dietitianAccountId), status: "ACTIVE" },
        include: {
          versions: {
            where: { status: "PUBLISHED" },
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              days: {
                take: 7,
                orderBy: { dayNumber: "asc" },
                include: {
                  meals: {
                    orderBy: { sortOrder: "asc" },
                    include: {
                      items: {
                        orderBy: { sortOrder: "asc" },
                        include: {
                          food: { select: { name: true } },
                          recipe: { select: { name: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const version = mealPlan?.versions[0];
      if (!mealPlan || !version) return null;
      return {
        name: mealPlan.name,
        publishedVersion: version.versionNumber,
        days: version.days.map((day) => ({
          dayNumber: day.dayNumber,
          meals: day.meals.map((meal) => ({
            name: meal.name,
            items: meal.items.map((item) => ({
              label: item.food?.name ?? item.recipe?.name ?? item.itemType,
              quantity: Number(item.quantity),
              unit: item.unit,
            })),
          })),
        })),
      };
    }

    const mealPlan = await this.prisma.mealPlan.findFirst({
      where: { clientId, ...tenantWhere(tenant.dietitianAccountId), status: "ACTIVE" },
      include: {
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });
    const version = mealPlan?.versions[0];
    if (!mealPlan || !version) return null;
    const snapshot = version.snapshot as { days?: SnapshotDay[] } | null;
    const days = Array.isArray(snapshot?.days)
      ? snapshot.days.slice(0, 7).map((day) => ({
          dayNumber: day.dayNumber ?? null,
          title: day.title ?? null,
          energyKcal: day.nutrition?.energyKcal ?? null,
          meals: (day.meals ?? []).map((meal) => meal.name).filter(Boolean),
        }))
      : [];
    return {
      name: mealPlan.name,
      publishedVersion: version.versionNumber,
      days,
    };
  }

  private normalizeClientBundle(client: Client, data: Record<string, unknown>) {
    return {
      client: {
        displayName: client.displayName ?? `${client.firstName} ${client.lastName}`,
        status: client.status,
        sex: client.sex,
        ageYears: ageYears(client.dateOfBirth),
      },
      ...data,
    };
  }
}

function profileSlice(profile: {
  nutritionContext: string | null;
  preferences: string | null;
  dietaryPreferences: string | null;
  allergies: string | null;
  intolerances: string | null;
  lifestyle: string | null;
  notes: string | null;
} | null) {
  if (!profile) return null;
  return compactValue({
    nutritionContext: profile.nutritionContext,
    preferences: profile.preferences,
    dietaryPreferences: profile.dietaryPreferences,
    allergies: profile.allergies,
    intolerances: profile.intolerances,
    lifestyle: profile.lifestyle,
    notes: profile.notes,
  });
}

function clinicalForAi(
  profile: {
    clinicalData?: unknown;
    nutritionContext?: string | null;
    preferences?: string | null;
    dietaryPreferences?: string | null;
    allergies?: string | null;
    intolerances?: string | null;
    lifestyle?: string | null;
    notes?: string | null;
  } | null,
) {
  if (!profile) return null;
  const { data } = migrateLegacyIntoClinical(profile);
  const { identity, ...clinical } = data;
  const occupation = identity.occupation?.trim();
  return compactValue({ ...clinical, occupation: occupation || undefined }) ?? null;
}

function ageYears(dob: Date | null): number | null {
  if (!dob) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const month = today.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function compactValue(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const next = value.map(compactValue).filter((item) => item !== undefined);
    return next.length ? next : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const compact = compactValue(item);
      if (compact !== undefined) out[key] = compact;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}
