import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { ClientService } from "./client.service";
import { computeBmi } from "../client-measurements/client-measurement.service";

const RECENT_TIMELINE_LIMIT = 6;
const MESSAGE_PREVIEW_LIMIT = 5;

@Injectable()
export class ClientPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientService,
  ) {}

  /** Read/composition-only aggregate — no mutations. */
  async get(tenant: DietitianTenantContext, clientId: string) {
    const client = await this.clients.get(tenant, clientId);
    const orgId = tenant.dietitianAccountId;

    const [
      goals,
      measurements,
      assessments,
      upcomingAppointment,
      mealPlan,
      timeline,
      conversation,
    ] = await Promise.all([
      this.prisma.clientGoal.findMany({
        where: { clientId, ...tenantWhere(orgId) },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.clientMeasurement.findMany({
        where: { clientId, ...tenantWhere(orgId) },
        orderBy: { measuredAt: "desc" },
        take: 40,
      }),
      this.prisma.assessment.findMany({
        where: { clientId, ...tenantWhere(orgId) },
        include: { template: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.appointment.findFirst({
        where: {
          clientId,
          ...tenantWhere(orgId),
          status: "SCHEDULED",
          startAt: { gte: new Date() },
        },
        orderBy: { startAt: "asc" },
      }),
      this.prisma.mealPlan.findFirst({
        where: { clientId, ...tenantWhere(orgId), status: { not: "ARCHIVED" } },
        orderBy: { updatedAt: "desc" },
        include: {
          versions: {
            where: { status: "PUBLISHED" },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true, publishedAt: true, status: true },
          },
        },
      }),
      this.prisma.timelineEvent.findMany({
        where: { clientId, ...tenantWhere(orgId) },
        orderBy: { occurredAt: "desc" },
        take: RECENT_TIMELINE_LIMIT,
      }),
      this.prisma.conversation.findUnique({
        where: {
          dietitianAccountId_clientId: { dietitianAccountId: orgId, clientId },
        },
      }),
    ]);

    const activeGoals = goals.filter((g) => g.status === "ACTIVE");
    const primaryGoal = activeGoals[0] ?? null;

    const latestByType = new Map<string, (typeof measurements)[number]>();
    for (const row of measurements) {
      if (!latestByType.has(row.type)) latestByType.set(row.type, row);
    }
    const latestMeasurements = [...latestByType.values()].map((row) => ({
      id: row.id,
      type: row.type,
      value: Number(row.value),
      unit: row.unit,
      measuredAt: row.measuredAt.toISOString(),
    }));
    const weight = latestByType.get("WEIGHT");
    const height = latestByType.get("HEIGHT");
    const bmi = computeBmi(
      weight ? Number(weight.value) : null,
      weight?.unit ?? null,
      height ? Number(height.value) : null,
      height?.unit ?? null,
    );

    const completed = assessments.find((a) => a.status === "COMPLETED");
    const latestAssessment = (completed ?? assessments[0])
      ? mapAssessment(completed ?? assessments[0]!)
      : null;

    const weightSeries = measurements
      .filter((m) => m.type === "WEIGHT")
      .slice()
      .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
    const heightSeries = measurements
      .filter((m) => m.type === "HEIGHT")
      .slice()
      .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
    let evolutionSummary: {
      weightDelta: number | null;
      weightUnit: string | null;
      bmiBaseline: number | null;
      bmiCurrent: number | null;
      pointCount: number;
    } | null = null;
    if (weightSeries.length >= 2) {
      const first = weightSeries[0]!;
      const last = weightSeries[weightSeries.length - 1]!;
      const firstH = heightSeries.filter((h) => h.measuredAt.getTime() <= first.measuredAt.getTime()).at(-1);
      const lastH = heightSeries.filter((h) => h.measuredAt.getTime() <= last.measuredAt.getTime()).at(-1);
      evolutionSummary = {
        weightDelta: Math.round((Number(last.value) - Number(first.value)) * 1000) / 1000,
        weightUnit: last.unit,
        bmiBaseline: firstH
          ? computeBmi(Number(first.value), first.unit, Number(firstH.value), firstH.unit)
          : null,
        bmiCurrent: lastH
          ? computeBmi(Number(last.value), last.unit, Number(lastH.value), lastH.unit)
          : bmi,
        pointCount: weightSeries.length,
      };
    }

    const published = mealPlan?.versions[0] ?? null;
    const activeMealPlan = mealPlan
      ? {
          id: mealPlan.id,
          name: mealPlan.name,
          status: mealPlan.status,
          publishedVersion: published
            ? {
                id: published.id,
                versionNumber: published.versionNumber,
                publishedAt: published.publishedAt?.toISOString() ?? null,
              }
            : null,
        }
      : null;

    let recentMessages: Array<{ id: string; body: string; createdAt: string; senderUserId: string }> =
      [];
    let unreadMessageCount = 0;
    if (conversation) {
      const messages = await this.prisma.message.findMany({
        where: { conversationId: conversation.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: MESSAGE_PREVIEW_LIMIT,
      });
      recentMessages = messages.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        senderUserId: m.senderUserId,
      }));
      const readState = await this.prisma.conversationReadState.findUnique({
        where: {
          conversationId_readerUserId: {
            conversationId: conversation.id,
            readerUserId: tenant.userId,
          },
        },
      });
      const since = readState?.lastReadAt ?? new Date(0);
      unreadMessageCount = await this.prisma.message.count({
        where: {
          conversationId: conversation.id,
          deletedAt: null,
          createdAt: { gt: since },
          senderUserId: { not: tenant.userId },
        },
      });
    }

    const profile = client.profile as {
      allergies?: string | null;
      intolerances?: string | null;
      dietaryPreferences?: string | null;
      lifestyle?: string | null;
      notes?: string | null;
      nutritionContext?: string | null;
      preferences?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    } | null;

    const hasRestrictions = Boolean(
      (profile?.allergies && profile.allergies.trim()) ||
        (profile?.intolerances && profile.intolerances.trim()) ||
        (profile?.dietaryPreferences && profile.dietaryPreferences.trim()),
    );

    const missing = {
      goals: activeGoals.length === 0,
      assessments: assessments.length === 0,
      measurements: !weight || !height,
      restrictions: !hasRestrictions,
      activeMealPlan: !activeMealPlan || !published,
      upcomingAppointment: !upcomingAppointment,
    };

    const alerts: Array<{ kind: string; label: string }> = [];
    if (profile?.allergies?.trim()) {
      alerts.push({ kind: "allergy", label: profile.allergies.trim() });
    }
    if (profile?.intolerances?.trim()) {
      alerts.push({ kind: "intolerance", label: profile.intolerances.trim() });
    }
    if (missing.goals) alerts.push({ kind: "missing", label: "No active goals" });
    if (missing.assessments) alerts.push({ kind: "missing", label: "No assessments yet" });
    if (missing.measurements) alerts.push({ kind: "missing", label: "Missing weight or height" });
    if (missing.restrictions) alerts.push({ kind: "missing", label: "No dietary restrictions recorded" });
    if (missing.activeMealPlan) alerts.push({ kind: "missing", label: "No published meal plan" });
    if (missing.upcomingAppointment) alerts.push({ kind: "missing", label: "No upcoming appointment" });

    return {
      client: {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        displayName: client.displayName,
        email: client.email,
        phone: client.phone,
        dateOfBirth: client.dateOfBirth,
        sex: client.sex,
        status: client.status,
        archivedAt: client.archivedAt,
        createdAt: client.createdAt,
        portalStatus: client.portalStatus,
        portalActivatedAt: client.portalActivatedAt,
        connectionStatus: client.connectionStatus,
        tags: client.tags,
      },
      profile: profile
        ? {
            nutritionContext: profile.nutritionContext ?? null,
            preferences: profile.preferences ?? null,
            dietaryPreferences: profile.dietaryPreferences ?? null,
            allergies: profile.allergies ?? null,
            intolerances: profile.intolerances ?? null,
            lifestyle: profile.lifestyle ?? null,
            notes: profile.notes ?? null,
            emergencyContactName: profile.emergencyContactName ?? null,
            emergencyContactPhone: profile.emergencyContactPhone ?? null,
          }
        : null,
      latestMeasurements,
      bmi,
      evolutionSummary,
      primaryGoal: primaryGoal
        ? {
            id: primaryGoal.id,
            title: primaryGoal.title,
            status: primaryGoal.status,
            targetValue: primaryGoal.targetValue ? Number(primaryGoal.targetValue) : null,
            targetUnit: primaryGoal.targetUnit,
          }
        : null,
      activeGoalsCount: activeGoals.length,
      latestAssessment,
      activeMealPlan,
      upcomingAppointment: upcomingAppointment
        ? {
            id: upcomingAppointment.id,
            title: upcomingAppointment.title,
            startAt: upcomingAppointment.startAt.toISOString(),
            endAt: upcomingAppointment.endAt.toISOString(),
            status: upcomingAppointment.status,
          }
        : null,
      recentMessages: {
        preview: recentMessages,
        unreadCount: unreadMessageCount,
      },
      recentTimeline: timeline.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata,
      })),
      missing,
      alerts,
      quickLinks: [
        { tab: "evolution", label: "Evolution" },
        { tab: "personal", label: "Personal information" },
        { tab: "assessments", label: "Patient evaluation" },
        { tab: "meal-plan", label: "Meal plans" },
        { tab: "tracking", label: "Tracking" },
        { tab: "appointments", label: "Appointments" },
        { tab: "messages", label: "Messages" },
        { tab: "documents", label: "Documents" },
        { tab: "timeline", label: "Timeline" },
        { tab: "goals", label: "Goals" },
      ],
    };
  }
}

function mapAssessment(row: {
  id: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  templateVersion: number;
  template: { id: string; name: string };
}) {
  return {
    id: row.id,
    status: row.status,
    templateName: row.template.name,
    templateId: row.template.id,
    templateVersion: row.templateVersion,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
