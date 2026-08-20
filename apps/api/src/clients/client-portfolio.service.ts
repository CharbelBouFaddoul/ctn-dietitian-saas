import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { tenantWhere } from "../organizations/tenant-scope";
import { ClientService } from "./client.service";

const RECENT_TIMELINE_LIMIT = 6;
const MESSAGE_PREVIEW_LIMIT = 5;

@Injectable()
export class ClientPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientService,
  ) {}

  /** Read/composition-only aggregate — no mutations. */
  async get(tenant: TenantContext, clientId: string) {
    const client = await this.clients.get(tenant, clientId);
    const orgId = tenant.organizationId;

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
        organizationId: client.organizationId,
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
        { tab: "personal", label: "Personal information" },
        { tab: "goals", label: "Goals" },
        { tab: "assessments", label: "Assessments" },
        { tab: "meal-plan", label: "Meal plans" },
        { tab: "tracking", label: "Tracking" },
        { tab: "timeline", label: "Timeline" },
        { tab: "appointments", label: "Appointments" },
        { tab: "messages", label: "Messages" },
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

/** BMI from kg + cm when units allow; null otherwise. */
function computeBmi(
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
