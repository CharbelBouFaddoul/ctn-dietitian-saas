import { BadRequestException, Injectable } from "@nestjs/common";
import { localDateKey } from "@nutrition-saas/utilities";
import type { Prisma } from "@prisma/client";
import { parseAssessmentSchema } from "../assessments/assessment-schema";
import { computeBmi } from "../client-measurements/client-measurement.service";
import { STORED_MEASUREMENT_TYPES } from "../client-measurements/measurement-types";
import { migrateLegacyIntoClinical, type ClinicalData } from "../client-profiles/clinical-data";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { PrismaService } from "../prisma/prisma.service";
import { ClientAccessService } from "./client-access.service";
import {
  CLIENT_PRINT_TITLES,
  isClientPrintDoc,
  type ClientPrintDoc,
} from "./client-print";

const MEASUREMENT_LABELS: Record<string, string> = {
  WEIGHT: "Weight",
  HEIGHT: "Height",
  WAIST: "Waist",
  HIPS: "Hips",
  BODY_FAT: "Body fat",
  FAT_MASS: "Fat mass",
  MUSCLE_MASS: "Muscle mass",
  MUSCLE_MASS_PERCENT: "Muscle mass %",
  LEAN_MASS: "Lean mass",
  BMI: "BMI",
  NECK: "Neck",
  CHEST: "Chest",
  ABDOMEN: "Abdomen",
  ARM: "Arm",
  FOREARM: "Forearm",
  WRIST: "Wrist",
  THIGH: "Thigh",
  CALF: "Calf",
  SKINFOLD_ABDOMINAL: "Skinfold abdominal",
  SKINFOLD_CHEST: "Skinfold chest",
  SKINFOLD_FRONT_THIGH: "Skinfold front thigh",
  SKINFOLD_MIDAXILLARY: "Skinfold midaxillary",
  SKINFOLD_SUBSCAPULAR: "Skinfold subscapular",
  SKINFOLD_SUPRAILIAC: "Skinfold suprailiac",
  SKINFOLD_TRICEPS: "Skinfold triceps",
  BP_DIASTOLIC: "Diastolic BP",
  BP_SYSTOLIC: "Systolic BP",
  CHOLESTEROL_HDL: "HDL",
  CHOLESTEROL_LDL: "LDL",
  CHOLESTEROL_TOTAL: "Total cholesterol",
  TRIGLYCERIDES: "Triglycerides",
};

type FieldRow = { label: string; value: string };

@Injectable()
export class ClientPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
  ) {}

  async get(tenant: DietitianTenantContext, clientId: string, docRaw: string | undefined) {
    if (!isClientPrintDoc(docRaw)) {
      throw new BadRequestException("Unknown print document");
    }
    const doc = docRaw;
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const orgId = tenant.dietitianAccountId;

    const [account, settings, measurements, profile] = await Promise.all([
      this.prisma.dietitianAccount.findFirst({
        where: { id: orgId },
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.dietitianSettings.findUnique({ where: { dietitianAccountId: orgId } }),
      this.prisma.clientMeasurement.findMany({
        where: { clientId, ...tenantWhere(orgId) },
        orderBy: { measuredAt: "desc" },
        take: 80,
      }),
      this.prisma.clientProfile.findFirst({
        where: { clientId, ...tenantWhere(orgId) },
      }),
    ]);

    const latestByType = new Map<string, (typeof measurements)[number]>();
    for (const row of measurements) {
      if (!latestByType.has(row.type)) latestByType.set(row.type, row);
    }
    const weight = latestByType.get("WEIGHT");
    const height = latestByType.get("HEIGHT");
    const bmi = computeBmi(
      weight ? Number(weight.value) : null,
      weight?.unit ?? null,
      height ? Number(height.value) : null,
      height?.unit ?? null,
    );

    const practiceName = settings?.practiceName?.trim() || account?.displayName || "Clinic";
    const address = [
      settings?.addressLine1,
      settings?.addressLine2,
      [settings?.city, settings?.region, settings?.postalCode].filter(Boolean).join(" "),
      settings?.country,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ");

    const header = {
      practice: {
        practiceName,
        contactEmail: settings?.contactEmail?.trim() || account?.user.email || null,
        contactPhone: settings?.contactPhone ?? null,
        address: address || null,
      },
      dietitian: {
        name: account?.displayName ?? "",
        title: account?.professionalTitle ?? null,
        specialization: account?.specialization ?? null,
        email: settings?.contactEmail?.trim() || account?.user.email || null,
      },
      client: {
        name: client.displayName || `${client.firstName} ${client.lastName}`.trim(),
        email: client.email,
        ageYears: ageYears(client.dateOfBirth),
        height: height ? { value: Number(height.value), unit: height.unit } : null,
        weight: weight ? { value: Number(weight.value), unit: weight.unit } : null,
        bmi,
      },
      generatedAt: new Date().toISOString(),
      doc,
      title: CLIENT_PRINT_TITLES[doc],
    };

    const clinical = migrateLegacyIntoClinical(profile ?? {}).data;
    const enabled = enabledMeasurementTypes(settings?.enabledMeasurements);

    const body = await this.buildBody(doc, {
      clientId,
      orgId,
      client,
      clinical,
      measurements,
      latestByType,
      enabled,
      timezone: settings?.timezone ?? "UTC",
    });

    return { ...header, body };
  }

  private async buildBody(
    doc: ClientPrintDoc,
    ctx: {
      clientId: string;
      orgId: string;
      client: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; sex: string | null; dateOfBirth: Date | null };
      clinical: ClinicalData;
      measurements: Array<{ type: string; value: Prisma.Decimal; unit: string; measuredAt: Date }>;
      latestByType: Map<string, { type: string; value: Prisma.Decimal; unit: string; measuredAt: Date }>;
      enabled: string[];
      timezone: string;
    },
  ) {
    if (doc === "clinical") return this.clinicalBody(ctx);
    if (doc === "assessments") return this.assessmentsBody(ctx);
    if (doc === "measurement") return this.measurementBody(ctx);
    if (doc === "tracking") return this.trackingBody(ctx);
    if (doc === "prescription") return this.prescriptionBody(ctx);
    if (doc === "nutrition-analysis") return this.nutritionAnalysisBody(ctx);
    return this.nutritionBody(ctx);
  }

  private async clinicalBody(ctx: {
    clientId: string;
    orgId: string;
    client: { firstName: string; lastName: string; email: string | null; phone: string | null; sex: string | null; dateOfBirth: Date | null };
    clinical: ClinicalData;
  }) {
    const [goals, documents] = await Promise.all([
      this.prisma.clientGoal.findMany({
        where: { clientId: ctx.clientId, ...tenantWhere(ctx.orgId) },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      this.prisma.document.findMany({
        where: { clientId: ctx.clientId, ...tenantWhere(ctx.orgId), status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { originalFilename: true, createdAt: true },
      }),
    ]);

    const years = ageYears(ctx.client.dateOfBirth);
    const identity: FieldRow[] = filled([
      { label: "First name", value: ctx.client.firstName },
      { label: "Last name", value: ctx.client.lastName },
      { label: "Email", value: ctx.client.email ?? "" },
      { label: "Phone", value: ctx.client.phone ?? "" },
      { label: "Sex", value: ctx.client.sex ?? "" },
      { label: "Date of birth", value: ctx.client.dateOfBirth ? ctx.client.dateOfBirth.toISOString().slice(0, 10) : "" },
      { label: "Age", value: years != null ? `${years} years` : "—" },
      { label: "Occupation", value: ctx.clinical.identity.occupation },
      { label: "Workplace", value: ctx.clinical.identity.workplace },
      { label: "Address", value: ctx.clinical.identity.address },
      { label: "Country", value: ctx.clinical.identity.country },
      { label: "Postal code", value: ctx.clinical.identity.zipCode },
      { label: "Process number", value: ctx.clinical.identity.processNumber },
      { label: "Health number", value: ctx.clinical.identity.healthNumber },
    ]);

    return {
      sections: [
        { title: "Identity", fields: identity },
        { title: "Visit", fields: objectFields(ctx.clinical.visit, VISIT_LABELS) },
        { title: "Lifestyle", fields: objectFields(ctx.clinical.lifestyle, LIFESTYLE_LABELS) },
        { title: "Health", fields: objectFields(ctx.clinical.health, HEALTH_LABELS) },
        { title: "Eating", fields: objectFields(ctx.clinical.eating, EATING_LABELS) },
        { title: "Nutrition notes", fields: objectFields(ctx.clinical.nutrition, NUTRITION_LABELS) },
      ].filter((section) => section.fields.length > 0),
      goals: goals.map((goal) => ({
        title: goal.title,
        status: goal.status,
        description: goal.description,
        targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null,
      })),
      documents: documents.map((row) => ({
        name: row.originalFilename,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async assessmentsBody(ctx: { clientId: string; orgId: string }) {
    const rows = await this.prisma.assessment.findMany({
      where: { clientId: ctx.clientId, ...tenantWhere(ctx.orgId), status: { not: "ARCHIVED" } },
      include: { template: { select: { name: true, schema: true } } },
      orderBy: { createdAt: "desc" },
    });

    const submitted = rows
      .filter((row) => row.status === "COMPLETED")
      .map((row) => {
        const schema = parseAssessmentSchema(row.schemaSnapshot ?? row.template.schema);
        const responses = (row.responses ?? {}) as Record<string, unknown>;
        const questions = schema.sections.flatMap((section) =>
          section.questions
            .filter((q) => q.active !== false)
            .map((q) => ({
              label: q.label,
              answer: formatAssessmentAnswer(responses[q.id], q),
            })),
        );
        return {
          name: row.template.name,
          completedAt: row.completedAt?.toISOString() ?? null,
          questions,
        };
      });

    const inProgress = rows
      .filter((row) => row.status !== "COMPLETED")
      .map((row) => ({
        name: row.template.name,
        status: row.status,
        startedAt: row.startedAt?.toISOString() ?? row.createdAt.toISOString(),
      }));

    return { submitted, inProgress };
  }

  private measurementBody(ctx: {
    measurements: Array<{ type: string; value: Prisma.Decimal; unit: string; measuredAt: Date }>;
    latestByType: Map<string, { type: string; value: Prisma.Decimal; unit: string; measuredAt: Date }>;
    enabled: string[];
  }) {
    const latest = ctx.enabled
      .map((type) => {
        const row = ctx.latestByType.get(type);
        if (!row) return null;
        return {
          type,
          label: MEASUREMENT_LABELS[type] ?? type,
          value: Number(row.value),
          unit: row.unit,
          measuredAt: row.measuredAt.toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const history = ctx.measurements.slice(0, 40).map((row) => ({
      type: row.type,
      label: MEASUREMENT_LABELS[row.type] ?? row.type,
      value: Number(row.value),
      unit: row.unit,
      measuredAt: row.measuredAt.toISOString(),
    }));

    return { latest, history };
  }

  private async trackingBody(ctx: { clientId: string; orgId: string; timezone: string }) {
    const today = localDateKey(new Date(), ctx.timezone);
    const fromKey = shiftDateKey(today, -6);
    const from = new Date(`${fromKey}T00:00:00.000Z`);
    const to = new Date(`${today}T23:59:59.999Z`);

    const [foodLogs, waterLogs, exerciseLogs, sleepLogs, habitLogs, assignments] = await Promise.all([
      this.prisma.foodLog.findMany({
        where: {
          clientId: ctx.clientId,
          ...tenantWhere(ctx.orgId),
          status: "ACTIVE",
          trackingDate: { gte: from, lte: to },
        },
        orderBy: { consumedAt: "asc" },
      }),
      this.prisma.waterLog.findMany({
        where: {
          clientId: ctx.clientId,
          ...tenantWhere(ctx.orgId),
          status: "ACTIVE",
          trackingDate: { gte: from, lte: to },
        },
      }),
      this.prisma.exerciseLog.findMany({
        where: {
          clientId: ctx.clientId,
          ...tenantWhere(ctx.orgId),
          status: "ACTIVE",
          trackingDate: { gte: from, lte: to },
        },
      }),
      this.prisma.sleepLog.findMany({
        where: {
          clientId: ctx.clientId,
          ...tenantWhere(ctx.orgId),
          status: "ACTIVE",
          date: { gte: from, lte: to },
        },
      }),
      this.prisma.habitLog.findMany({
        where: {
          clientId: ctx.clientId,
          ...tenantWhere(ctx.orgId),
          status: "ACTIVE",
          logDate: { gte: from, lte: to },
        },
      }),
      this.prisma.clientHabitAssignment.findMany({
        where: { clientId: ctx.clientId, ...tenantWhere(ctx.orgId), active: true },
        include: { habitDefinition: true },
      }),
    ]);

    const days: string[] = [];
    for (let i = 0; i < 7; i += 1) days.push(shiftDateKey(fromKey, i));

    return {
      from: fromKey,
      to: today,
      days: days.map((date) => {
        const foods = foodLogs.filter((row) => dateKey(row.trackingDate) === date);
        const water = waterLogs.filter((row) => dateKey(row.trackingDate) === date);
        const exercise = exerciseLogs.filter((row) => dateKey(row.trackingDate) === date);
        const sleep = sleepLogs.find((row) => dateKey(row.date) === date) ?? null;
        const habits = assignments
          .filter((a) => a.habitDefinition.active && !a.habitDefinition.archivedAt)
          .map((assignment) => {
            const log = habitLogs.find(
              (row) =>
                dateKey(row.logDate) === date &&
                (row.habitDefinitionId === assignment.habitDefinition.id ||
                  row.habitKey === assignment.habitDefinition.id),
            );
            return {
              name: assignment.habitDefinition.name,
              completed: log?.completed ?? false,
            };
          });
        return {
          date,
          foods: foods.map((row) => ({
            name: row.displayName ?? "Food",
            quantity: Number(row.quantity),
            unit: row.unit,
            meal: row.mealCategory,
          })),
          waterMl: water.reduce((sum, row) => sum + Number(row.amountMl), 0),
          exercise: exercise.map((row) => ({
            activity: row.activityType,
            minutes: row.durationMinutes,
            intensity: row.intensity,
          })),
          sleep: sleep
            ? { minutes: sleep.durationMinutes, quality: sleep.quality }
            : null,
          habits,
        };
      }),
    };
  }

  private prescriptionBody(ctx: {
    clinical: ClinicalData;
    latestByType: Map<string, { value: Prisma.Decimal; unit: string }>;
  }) {
    const rx = ctx.clinical.prescription;
    const weight = ctx.latestByType.get("WEIGHT");
    const height = ctx.latestByType.get("HEIGHT");
    const bodyFat = ctx.latestByType.get("BODY_FAT");
    return {
      current: {
        weightKg: weight ? Number(weight.value) : null,
        weightUnit: weight?.unit ?? null,
        height: height ? Number(height.value) : null,
        heightUnit: height?.unit ?? null,
        bmi: computeBmi(
          weight ? Number(weight.value) : null,
          weight?.unit ?? null,
          height ? Number(height.value) : null,
          height?.unit ?? null,
        ),
        bodyFatPct: bodyFat ? Number(bodyFat.value) : rx.bodyFatCurrentPct,
      },
      goals: {
        weightKg: rx.weightGoalKg,
        bodyFatPct: rx.bodyFatGoalPct,
        energyKcal: rx.energyGoalKcal,
      },
      energy: {
        bmrFormula: rx.bmrFormula || null,
        energyFormula: rx.energyFormula || null,
        palCurrentKey: rx.palCurrentKey || null,
        palCurrentValue: rx.palCurrentValue,
        palGoalKey: rx.palGoalKey || null,
      },
      macros: {
        fatPct: rx.macro.fatPct,
        carbPct: rx.macro.carbPct,
        proteinPct: rx.macro.proteinPct,
        proteinPerKg: rx.proteinPerKg,
        fiberGoalG: rx.fiberGoalG,
      },
      duration: {
        beginDate: rx.beginDate || null,
        forecastFinishDate: rx.forecastFinishDate || null,
      },
    };
  }

  private async nutritionBody(ctx: { clientId: string; orgId: string }) {
    const loaded = await this.loadMealPlan(ctx);
    if (!loaded) {
      return { plan: null, days: [] as unknown[] };
    }
    const { plan, version } = loaded;
    if (!version) {
      return { plan: { name: plan.name, status: plan.status, version: null }, days: [] };
    }
    const days = await this.prisma.mealPlanDay.findMany({
      where: { mealPlanVersionId: version.id },
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
    });
    return {
      plan: {
        name: plan.name,
        status: plan.status,
        version: version.versionNumber,
        versionStatus: version.status,
      },
      days: days.map((day) => ({
        title: day.title,
        weekday: day.weekday,
        meals: day.meals.map((meal) => ({
          name: meal.name,
          items: meal.items.map((item) => ({
            name: item.food?.name ?? item.recipe?.name ?? item.notes ?? "Item",
            quantity: Number(item.quantity),
            unit: item.unit,
          })),
        })),
      })),
    };
  }

  private async nutritionAnalysisBody(ctx: { clientId: string; orgId: string; clinical: ClinicalData }) {
    const loaded = await this.loadMealPlan(ctx);
    const targets = resolvePrintMacroTargets(ctx.clinical.nutrition.targets);
    const targetsFromClient = Boolean(
      [
        ctx.clinical.nutrition.targets.energyKcal,
        ctx.clinical.nutrition.targets.fatG,
        ctx.clinical.nutrition.targets.carbohydrateG,
        ctx.clinical.nutrition.targets.proteinG,
        ctx.clinical.nutrition.targets.fiberG,
      ].some((value) => value != null && value > 0),
    );
    if (!loaded) {
      return { plan: null, targets, targetsFromClient, days: [] as unknown[] };
    }
    const { plan, version } = loaded;
    if (!version) {
      return { plan: { name: plan.name, status: plan.status, version: null }, targets, targetsFromClient, days: [] };
    }
    const snapshotDays = snapshotAnalysisDays(version.snapshot);
    const days =
      snapshotDays.length > 0
        ? snapshotDays
        : (
            await this.prisma.mealPlanDay.findMany({
              where: { mealPlanVersionId: version.id },
              orderBy: { dayNumber: "asc" },
              include: { meals: { orderBy: { sortOrder: "asc" } } },
            })
          ).map((day) => ({
            title: day.title,
            weekday: day.weekday,
            dayNumber: day.dayNumber,
            totals: emptyMacros(),
            presented: emptyPresented(),
            extras: {},
            meals: day.meals.map((meal) => ({
              name: meal.name,
              totals: emptyMacros(),
              presented: emptyPresented(),
              extras: {},
              items: [] as unknown[],
            })),
          }));
    return {
      plan: {
        name: plan.name,
        status: plan.status,
        version: version.versionNumber,
        versionStatus: version.status,
      },
      targets,
      targetsFromClient,
      // Analysis tab shows one focused day; printing every snapshot day stacked the same report.
      days: days.slice(0, 1),
    };
  }

  private async loadMealPlan(ctx: { clientId: string; orgId: string }) {
    const plans = await this.prisma.mealPlan.findMany({
      where: { clientId: ctx.clientId, ...tenantWhere(ctx.orgId), status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: { updatedAt: "desc" },
    });
    const plan = plans.find((row) => row.status === "ACTIVE") ?? plans[0];
    if (!plan) return null;
    const version =
      (await this.prisma.mealPlanVersion.findFirst({
        where: { mealPlanId: plan.id, status: "PUBLISHED", ...tenantWhere(ctx.orgId) },
        orderBy: { publishedAt: "desc" },
      })) ??
      (await this.prisma.mealPlanVersion.findFirst({
        where: { mealPlanId: plan.id, ...tenantWhere(ctx.orgId) },
        orderBy: { versionNumber: "desc" },
      }));
    return { plan, version };
  }
}

function ageYears(dob: Date | null): number | null {
  if (!dob) return null;
  const year = dob.getUTCFullYear();
  const month = dob.getUTCMonth();
  const day = dob.getUTCDate();
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

type PrintMacros = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

const DEFAULT_PRINT_TARGETS: PrintMacros = {
  energyKcal: 2000,
  fatG: 70,
  carbohydrateG: 260,
  proteinG: 90,
  fiberG: 28,
};

function emptyMacros(): PrintMacros {
  return { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null, fiberG: null };
}

function emptyPresented() {
  return { ...emptyMacros(), sugarG: null, sodiumMg: null };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function presentedRecord(source: unknown) {
  const row = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const presented = row.presented && typeof row.presented === "object" ? (row.presented as Record<string, unknown>) : {};
  return {
    energyKcal: numberOrNull(presented.energyKcal),
    proteinG: numberOrNull(presented.proteinG),
    carbohydrateG: numberOrNull(presented.carbohydrateG),
    fatG: numberOrNull(presented.fatG),
    fiberG: numberOrNull(presented.fiberG),
    sugarG: numberOrNull(presented.sugarG),
    sodiumMg: numberOrNull(presented.sodiumMg),
  };
}

function extrasRecord(source: unknown): Record<string, number | null> {
  const row = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const extras =
    (row.presentedExtraNutrients && typeof row.presentedExtraNutrients === "object"
      ? row.presentedExtraNutrients
      : row.extraNutrients && typeof row.extraNutrients === "object"
        ? row.extraNutrients
        : {}) as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(extras)) {
    out[key] = numberOrNull(value);
  }
  return out;
}

function resolvePrintMacroTargets(targets: ClinicalData["nutrition"]["targets"]): PrintMacros {
  const pick = (value: number | null | undefined, fallback: number) =>
    value != null && value > 0 ? value : fallback;
  return {
    energyKcal: pick(targets.energyKcal, 2000),
    fatG: pick(targets.fatG, 70),
    carbohydrateG: pick(targets.carbohydrateG, 260),
    proteinG: pick(targets.proteinG, 90),
    fiberG: pick(targets.fiberG, 28),
  };
}

function presentedMacros(source: unknown): PrintMacros {
  if (!source || typeof source !== "object") return emptyMacros();
  const presented = (source as { presented?: Record<string, unknown> }).presented;
  const n = (key: string) => {
    const value = presented?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    energyKcal: n("energyKcal"),
    proteinG: n("proteinG"),
    carbohydrateG: n("carbohydrateG"),
    fatG: n("fatG"),
    fiberG: n("fiberG"),
  };
}

function snapshotAnalysisDays(raw: unknown) {
  if (!raw || typeof raw !== "object") return [];
  const days = (raw as { days?: unknown }).days;
  if (!Array.isArray(days)) return [];
  return days.map((day, index) => {
    const row = day && typeof day === "object" ? (day as Record<string, unknown>) : {};
    const meals = Array.isArray(row.meals) ? row.meals : [];
    return {
      title: typeof row.title === "string" ? row.title : null,
      weekday: typeof row.weekday === "string" ? row.weekday : null,
      dayNumber: typeof row.dayNumber === "number" ? row.dayNumber : index + 1,
      totals: presentedMacros(row),
      presented: presentedRecord(row),
      extras: extrasRecord(row),
      meals: meals.map((meal) => {
        const item = meal && typeof meal === "object" ? (meal as Record<string, unknown>) : {};
        const items = Array.isArray(item.items) ? item.items : [];
        return {
          name: typeof item.name === "string" ? item.name : "Meal",
          totals: presentedMacros(item),
          presented: presentedRecord(item),
          extras: extrasRecord(item),
          items: items.map((entry) => {
            const foodItem = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
            const food = foodItem.food && typeof foodItem.food === "object" ? (foodItem.food as Record<string, unknown>) : null;
            const recipe =
              foodItem.recipe && typeof foodItem.recipe === "object" ? (foodItem.recipe as Record<string, unknown>) : null;
            return {
              name:
                (typeof food?.name === "string" && food.name) ||
                (typeof recipe?.name === "string" && recipe.name) ||
                (typeof foodItem.notes === "string" && foodItem.notes) ||
                "Item",
              quantity: numberOrNull(foodItem.quantity) ?? 0,
              unit: typeof foodItem.unit === "string" ? foodItem.unit : "",
              itemType: typeof foodItem.itemType === "string" ? foodItem.itemType : "FOOD",
              food: food
                ? {
                    name: typeof food.name === "string" ? food.name : "Food",
                    category: typeof food.category === "string" ? food.category : null,
                  }
                : null,
              presented: presentedRecord(foodItem),
            };
          }),
        };
      }),
    };
  });
}

function enabledMeasurementTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...STORED_MEASUREMENT_TYPES];
  const types = raw.filter(
    (item): item is string =>
      typeof item === "string" && (STORED_MEASUREMENT_TYPES as readonly string[]).includes(item),
  );
  return types.length > 0 ? [...new Set(types)] : [...STORED_MEASUREMENT_TYPES];
}

function shiftDateKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function filled(rows: FieldRow[]): FieldRow[] {
  return rows.filter((row) => row.value.trim().length > 0);
}

function objectFields(source: Record<string, unknown>, labels: Record<string, string>): FieldRow[] {
  return filled(
    Object.entries(labels).map(([key, label]) => {
      const value = source[key];
      if (value == null || typeof value === "object") return { label, value: "" };
      return { label, value: String(value) };
    }),
  );
}

function formatAssessmentAnswer(
  value: unknown,
  question: { type: string; options?: Array<{ id: string; label: string }> },
): string {
  if (value == null || value === "") return "—";
  if (question.type === "BOOLEAN") return value ? "Yes" : "No";
  if (question.type === "SINGLE_CHOICE") {
    const opt = question.options?.find((o) => o.id === value);
    return opt?.label ?? String(value);
  }
  if (question.type === "MULTI_CHOICE" && Array.isArray(value)) {
    return value
      .map((id) => question.options?.find((o) => o.id === id)?.label ?? String(id))
      .join(", ");
  }
  return String(value);
}

const VISIT_LABELS: Record<string, string> = {
  reason: "Reason",
  expectations: "Expectations",
  clinicalAims: "Care aims",
  clinicalAimsNotes: "Care aims notes",
  other: "Other notes",
};

const LIFESTYLE_LABELS: Record<string, string> = {
  bowelHabits: "Bowel habits",
  bowelHabitsNotes: "Bowel notes",
  sleepQuality: "Sleep",
  sleepQualityNotes: "Sleep notes",
  smoking: "Tobacco",
  smokingNotes: "Tobacco notes",
  alcohol: "Alcohol",
  alcoholNotes: "Alcohol notes",
  maritalStatus: "Household",
  maritalStatusNotes: "Household notes",
  physicalActivity: "Activity",
  physicalActivityNotes: "Activity notes",
  background: "Background",
  other: "Other notes",
};

const HEALTH_LABELS: Record<string, string> = {
  conditions: "Conditions",
  conditionsNotes: "Condition notes",
  medication: "Medication",
  personalHistory: "Personal history",
  familyHistory: "Family history",
  other: "Other notes",
};

const EATING_LABELS: Record<string, string> = {
  usualWakeTime: "Wake time",
  usualBedTime: "Bed time",
  dietTypes: "Diet style",
  dietTypesNotes: "Diet notes",
  preferredFoods: "Preferred foods",
  dislikedFoods: "Disliked foods",
  allergies: "Allergies",
  allergiesNotes: "Allergy notes",
  intolerances: "Intolerances",
  intolerancesNotes: "Intolerance notes",
};

const NUTRITION_LABELS: Record<string, string> = {
  deficiencies: "Nutrient gaps",
  deficienciesNotes: "Gap notes",
  waterIntake: "Fluid intake",
  other: "Other notes",
};
