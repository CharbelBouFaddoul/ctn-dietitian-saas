import { Injectable } from "@nestjs/common";
import type { Client } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ClientAccessService } from "../clients/client-access.service";
import type { TenantContext } from "../organizations/tenant.types";
import { TrackingSummaryService } from "../tracking/tracking-summary.service";
import { tenantWhere } from "../organizations/tenant-scope";

@Injectable()
export class AiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly trackingSummary: TrackingSummaryService,
  ) {}

  async buildClientContext(tenant: TenantContext, clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const [profile, goals, measurements, assessments, appointments, mealPlan, timeline, tracking] =
      await Promise.all([
        this.prisma.clientProfile.findUnique({ where: { clientId } }),
        this.prisma.clientGoal.findMany({
          where: { clientId, ...tenantWhere(tenant.organizationId) },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        this.prisma.clientMeasurement.findMany({
          where: { clientId, ...tenantWhere(tenant.organizationId) },
          orderBy: { measuredAt: "desc" },
          take: 5,
        }),
        this.prisma.assessment.findMany({
          where: { clientId, ...tenantWhere(tenant.organizationId) },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { template: true },
        }),
        this.prisma.appointment.findMany({
          where: { clientId, ...tenantWhere(tenant.organizationId) },
          orderBy: { startAt: "desc" },
          take: 5,
        }),
        this.prisma.mealPlan.findFirst({
          where: { clientId, ...tenantWhere(tenant.organizationId), status: "ACTIVE" },
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
        }),
        this.prisma.timelineEvent.findMany({
          where: { clientId, ...tenantWhere(tenant.organizationId) },
          orderBy: { occurredAt: "desc" },
          take: 8,
          select: { type: true, occurredAt: true },
        }),
        this.trackingSummary.dailySummary(client).catch(() => null),
      ]);

    return this.normalizeClientBundle(client, {
      profile: profile
        ? {
            nutritionContext: profile.nutritionContext,
            preferences: profile.preferences,
            dietaryPreferences: profile.dietaryPreferences,
            allergies: profile.allergies,
            notes: profile.notes,
          }
        : null,
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
      assessments: assessments.map((row) => ({
        status: row.status,
        template: row.template.name,
        version: row.template.version,
      })),
      appointments: appointments.map((row) => ({
        title: row.title,
        status: row.status,
        startAt: row.startAt.toISOString(),
      })),
      activeMealPlan: mealPlan
        ? {
            name: mealPlan.name,
            publishedVersion: mealPlan.versions[0]?.versionNumber ?? null,
            days: mealPlan.versions[0]?.days.map((day) => ({
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
          }
        : null,
      recentTimeline: timeline.map((row) => ({ type: row.type, occurredAt: row.occurredAt.toISOString() })),
      recentTracking: tracking,
    });
  }

  async buildNutritionContext(tenant: TenantContext, clientId: string, foodQuery?: string) {
    const base = await this.buildClientContext(tenant, clientId);
    const foods = foodQuery
      ? await this.prisma.food.findMany({
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
      : [];
    return {
      ...base,
      foods: foods.map((row) => ({
        name: row.name,
        energyKcal: row.energyKcal ? Number(row.energyKcal) : null,
        proteinG: row.proteinG ? Number(row.proteinG) : null,
        carbohydrateG: row.carbohydrateG ? Number(row.carbohydrateG) : null,
        fatG: row.fatG ? Number(row.fatG) : null,
        fiberG: row.fiberG ? Number(row.fiberG) : null,
      })),
    };
  }

  async buildMessageContext(tenant: TenantContext, clientId: string) {
    const base = await this.buildClientContext(tenant, clientId);
    const messages = await this.prisma.message.findMany({
      where: { clientId, ...tenantWhere(tenant.organizationId), deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { body: true, createdAt: true },
    });
    return {
      ...base,
      recentMessages: messages.map((row) => ({
        excerpt: row.body.slice(0, 240),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private normalizeClientBundle(client: Client, data: Record<string, unknown>) {
    return {
      client: {
        displayName: client.displayName ?? `${client.firstName} ${client.lastName}`,
        status: client.status,
      },
      ...data,
    };
  }
}
