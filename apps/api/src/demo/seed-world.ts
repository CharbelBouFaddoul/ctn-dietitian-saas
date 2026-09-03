import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as argon2 from "argon2";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEMO_EMAILS,
  DEMO_PRACTICES,
  DEMO_SETTINGS,
  demoPassword,
} from "./constants";
import { importDemoFoodCatalog, importDemoRecipes, type CatalogImportMode } from "./imports";
import { seedPlatformBootstrap } from "./wipe";
import { DEFAULT_PLATFORM_SETTINGS } from "../platform-settings/platform-settings.defaults";
import {
  applyAliceHarborSettings,
  createEmmaRacePrepPlan,
  emmaClinicalData,
  emmaDateOfBirth,
  EMMA_CHART_NOTES,
  HARBOR_DOCUMENT_BODY,
  HARBOR_INTAKE_RESPONSES,
  HARBOR_INTAKE_SCHEMA,
  pickHarborPantry,
  completeHarborPantryNutrition,
  seedEmmaAppointments,
  seedEmmaMessages,
  seedEmmaTracking,
} from "./seed-harbor-demo";

export type SeedDemoOptions = {
  /** full = curated foods + starter recipes; sample = small food set; none = hand foods only */
  catalog?: CatalogImportMode;
  password?: string;
  /** When true, skip optional AI usage rows even if AI_ENABLED */
  skipAi?: boolean;
};

export type DemoWorld = {
  password: string;
  users: {
    superAdminId: string;
    platformAdminId: string;
    aliceUserId: string;
    bobUserId: string;
    charlieUserId: string;
    sharedPatientUserId: string;
  };
  practices: {
    aliceId: string;
    bobId: string;
    charlieId: string;
  };
  clients: {
    sharedAliceClientId: string;
    sharedBobClientId: string;
    emmaClientId: string;
    noahClientId: string;
    avaClientId: string;
  };
  foods: {
    catalogFoodId: string | null;
    aliceCustomFoodId: string;
    bobCustomFoodId: string;
  };
  recipes: {
    aliceRecipeId: string;
    bobRecipeId: string;
  };
  mealPlans: {
    emmaPublishedPlanId: string;
    emmaPublishedVersionId: string;
  };
};

type Nut = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

const EMPTY_EXTRA = {};

function nut(partial: Partial<Nut> = {}): Nut {
  return {
    energyKcal: partial.energyKcal ?? 0,
    proteinG: partial.proteinG ?? 0,
    carbohydrateG: partial.carbohydrateG ?? 0,
    fatG: partial.fatG ?? 0,
    fiberG: partial.fiberG ?? 0,
    sugarG: partial.sugarG ?? null,
    sodiumMg: partial.sodiumMg ?? null,
  };
}

/** FoodLog.nutritionSnapshot shape expected by tracking summary / food log APIs. */
function foodLogNutritionSnapshotV1(input: {
  foodId: string;
  foodName: string;
  quantity: number;
  unit: string;
  nutrition: Partial<Nut>;
}): Record<string, unknown> {
  const nutrition = nut(input.nutrition);
  return {
    schemaVersion: 1,
    foodId: input.foodId,
    foodName: input.foodName,
    quantity: input.quantity,
    unit: input.unit,
    referenceQuantity: 100,
    referenceUnit: "g",
    nutrition,
    presented: nutrition,
    capturedAt: new Date().toISOString(),
  };
}

function foodLogNutritionSnapshotV2(input: {
  mealId: string;
  mealName: string;
  mealPlanVersionId: string;
  nutrition: Partial<Nut>;
}): Record<string, unknown> {
  const nutrition = nut(input.nutrition);
  return {
    schemaVersion: 2,
    sourceType: "PLANNED_MEAL",
    mealId: input.mealId,
    mealName: input.mealName,
    mealPlanVersionId: input.mealPlanVersionId,
    foodName: input.mealName,
    servingsLogged: 1,
    servingDescription: null,
    nutrition,
    presented: nutrition,
    items: [],
    capturedAt: new Date().toISOString(),
  };
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function daysAgo(n: number): Date {
  // Always strictly in the past (avoids “today noon UTC” landing after live afternoon messages).
  return hoursAgo(n * 24 + 3);
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(14, 0, 0, 0);
  return d;
}

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function hashPassword(password: string): Promise<string> {
  const test = process.env.NODE_ENV === "test";
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: test ? 4096 : 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function upsertUser(
  prisma: PrismaClient,
  input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    platformRole?: "SUPER_ADMIN" | "ADMIN" | null;
  },
) {
  const emailNormalized = input.email.toLowerCase();
  return prisma.user.upsert({
    where: { emailNormalized },
    update: {
      passwordHash: input.passwordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      firstName: input.firstName,
      lastName: input.lastName,
      platformRole: input.platformRole ?? null,
      suspendedAt: null,
      archivedAt: null,
    },
    create: {
      email: input.email,
      emailNormalized,
      passwordHash: input.passwordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      firstName: input.firstName,
      lastName: input.lastName,
      platformRole: input.platformRole ?? null,
    },
  });
}

async function ensurePractice(
  prisma: PrismaClient,
  userId: string,
  meta: (typeof DEMO_PRACTICES)[keyof typeof DEMO_PRACTICES],
) {
  const existing = await prisma.dietitianAccount.findUnique({ where: { userId } });
  if (existing) {
    await prisma.dietitianAccount.update({
      where: { id: existing.id },
      data: {
        displayName: meta.displayName,
        slug: meta.slug,
        status: "ACTIVE",
        professionalTitle: meta.professionalTitle,
        specialization: meta.specialization,
        archivedAt: null,
        suspendedAt: null,
      },
    });
    await prisma.dietitianSettings.upsert({
      where: { dietitianAccountId: existing.id },
      update: {
        practiceName: meta.practiceName,
        contactEmail: undefined,
      },
      create: {
        dietitianAccountId: existing.id,
        ...DEMO_SETTINGS,
        practiceName: meta.practiceName,
      },
    });
    return existing.id;
  }
  const created = await prisma.dietitianAccount.create({
    data: {
      userId,
      displayName: meta.displayName,
      slug: meta.slug,
      status: "ACTIVE",
      professionalTitle: meta.professionalTitle,
      specialization: meta.specialization,
      settings: {
        create: {
          ...DEMO_SETTINGS,
          practiceName: meta.practiceName,
        },
      },
    },
  });
  return created.id;
}

async function ensureSubscription(prisma: PrismaClient, dietitianAccountId: string, planSlug: string) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: planSlug } });
  const periodEnd = new Date();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  await prisma.subscription.upsert({
    where: { dietitianAccountId },
    update: {
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
    },
    create: {
      dietitianAccountId,
      planId: plan.id,
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
  });
}

async function createClientWithPortal(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    createdById: string;
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    sex?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";
    dateOfBirth?: Date;
    phone?: string;
    notes?: string;
    allergies?: string;
    intolerances?: string;
    lifestyle?: string;
    clinicalData?: Prisma.InputJsonValue;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    goalTitle?: string;
    goalDescription?: string;
    goalTargetValue?: number;
    goalTargetUnit?: string;
    tags?: string[];
    chartNotes?: Array<{
      kind: "CLINICAL" | "MEAL" | "EATING_HABIT" | "PREGNANCY";
      body: string;
      mealSlot?: string;
      notedAt?: Date;
    }>;
    existingUserId?: string;
  },
) {
  const user =
    input.existingUserId != null
      ? await prisma.user.findUniqueOrThrow({ where: { id: input.existingUserId } })
      : await upsertUser(prisma, {
          email: input.email,
          passwordHash: input.passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
        });

  const client = await prisma.client.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      email: input.email,
      phone: input.phone ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      sex: input.sex ?? "UNSPECIFIED",
      status: "ACTIVE",
      createdById: input.createdById,
      profile: {
        create: {
          dietitianAccountId: input.dietitianAccountId,
          notes: input.notes ?? null,
          allergies: input.allergies ?? null,
          intolerances: input.intolerances ?? null,
          lifestyle: input.lifestyle ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          clinicalData: input.clinicalData ?? undefined,
        },
      },
    },
  });

  await prisma.clientAccount.create({
    data: {
      userId: user.id,
      dietitianAccountId: input.dietitianAccountId,
      clientId: client.id,
      status: "ACTIVE",
      activatedAt: new Date(),
    },
  });

  if (input.goalTitle) {
    await prisma.clientGoal.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: client.id,
        title: input.goalTitle,
        description: input.goalDescription ?? null,
        targetValue: input.goalTargetValue ?? null,
        targetUnit: input.goalTargetUnit ?? null,
        status: "ACTIVE",
        targetDate: daysFromNow(90),
        createdById: input.createdById,
      },
    });
  }

  for (const note of input.chartNotes ?? []) {
    await prisma.clientChartNote.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: client.id,
        kind: note.kind,
        body: note.body,
        mealSlot: note.mealSlot ?? null,
        notedAt: note.notedAt ?? new Date(),
      },
    });
  }

  for (const tagName of input.tags ?? []) {
    const tag = await prisma.tag.upsert({
      where: {
        dietitianAccountId_name: { dietitianAccountId: input.dietitianAccountId, name: tagName },
      },
      update: {},
      create: { dietitianAccountId: input.dietitianAccountId, name: tagName },
    });
    await prisma.clientTag.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: client.id,
        tagId: tag.id,
      },
    });
  }

  await prisma.timelineEvent.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: client.id,
      type: "CLIENT_CREATED",
      actorUserId: input.createdById,
      occurredAt: daysAgo(40),
    },
  });

  return { client, user };
}

function buildMealSnapshot(input: {
  planName: string;
  versionNumber: number;
  days: Array<{
    id: string;
    dayNumber: number;
    meals: Array<{
      id: string;
      name: string;
      sortOrder: number;
      items: Array<{
        id: string;
        itemType: "FOOD" | "RECIPE";
        quantity: number;
        unit: string;
        food?: { id: string; name: string } | null;
        recipe?: { id: string; name: string; servings: number } | null;
        nutrition: Nut;
      }>;
    }>;
  }>;
}): Prisma.InputJsonValue {
  const calculatedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    calculatedAt,
    planName: input.planName,
    planDescription: null,
    dayLabelMode: "NUMBERED",
    versionNumber: input.versionNumber,
    days: input.days.map((day) => {
      const dayNut = nut();
      const meals = day.meals.map((meal) => {
        const mealNut = nut();
        const items = meal.items.map((item) => {
          mealNut.energyKcal = (mealNut.energyKcal ?? 0) + (item.nutrition.energyKcal ?? 0);
          mealNut.proteinG = (mealNut.proteinG ?? 0) + (item.nutrition.proteinG ?? 0);
          mealNut.carbohydrateG = (mealNut.carbohydrateG ?? 0) + (item.nutrition.carbohydrateG ?? 0);
          mealNut.fatG = (mealNut.fatG ?? 0) + (item.nutrition.fatG ?? 0);
          mealNut.fiberG = (mealNut.fiberG ?? 0) + (item.nutrition.fiberG ?? 0);
          return {
            id: item.id,
            itemType: item.itemType,
            quantity: item.quantity,
            unit: item.unit,
            notes: null,
            food: item.food
              ? {
                  id: item.food.id,
                  name: item.food.name,
                  origin: "catalog" as const,
                  servingDescription: null,
                }
              : null,
            recipe: item.recipe
              ? { id: item.recipe.id, name: item.recipe.name, servings: item.recipe.servings }
              : null,
            nutrition: item.nutrition,
            presented: item.nutrition,
            extraNutrients: EMPTY_EXTRA,
            presentedExtraNutrients: EMPTY_EXTRA,
          };
        });
        dayNut.energyKcal = (dayNut.energyKcal ?? 0) + (mealNut.energyKcal ?? 0);
        dayNut.proteinG = (dayNut.proteinG ?? 0) + (mealNut.proteinG ?? 0);
        dayNut.carbohydrateG = (dayNut.carbohydrateG ?? 0) + (mealNut.carbohydrateG ?? 0);
        dayNut.fatG = (dayNut.fatG ?? 0) + (mealNut.fatG ?? 0);
        dayNut.fiberG = (dayNut.fiberG ?? 0) + (mealNut.fiberG ?? 0);
        return {
          id: meal.id,
          name: meal.name,
          sortOrder: meal.sortOrder,
          notes: null,
          nutrition: mealNut,
          presented: mealNut,
          extraNutrients: EMPTY_EXTRA,
          presentedExtraNutrients: EMPTY_EXTRA,
          items,
        };
      });
      return {
        id: day.id,
        dayNumber: day.dayNumber,
        weekday: null,
        title: null,
        notes: null,
        nutrition: dayNut,
        presented: dayNut,
        extraNutrients: EMPTY_EXTRA,
        presentedExtraNutrients: EMPTY_EXTRA,
        meals,
      };
    }),
  } as unknown as Prisma.InputJsonValue;
}

/**
 * Seeds a complete multi-tenant V1 demo world.
 * Assumes DB was wiped (or is empty of conflicting demo emails) and platform catalog is seeded.
 */
export async function seedDemoWorld(
  prisma: PrismaClient,
  options: SeedDemoOptions = {},
): Promise<DemoWorld> {
  const password = options.password ?? demoPassword();
  const passwordHash = await hashPassword(password);
  const catalogMode: CatalogImportMode = options.catalog ?? "full";

  await seedPlatformBootstrap(prisma, { registrationEnabled: false });
  const defaults = DEFAULT_PLATFORM_SETTINGS;
  await prisma.platformSettings.updateMany({
    data: {
      dietitianRegistrationEnabled: true,
      patientRegistrationEnabled: true,
      plansPageEnabled: true,
      trialSignupEnabled: true,
      emailVerificationRequired: false,
      onlineCheckoutEnabled: false,
      trialDurationDays: defaults.trialDurationDays,
      trialPlanSlug: defaults.trialPlanSlug,
      ctaText: defaults.ctaText,
      ctaHref: defaults.ctaHref,
      ctaVisible: true,
      navItems: defaults.navItems as unknown as Prisma.InputJsonValue,
      footerGroups: defaults.footerGroups as unknown as Prisma.InputJsonValue,
    },
  });

  if (catalogMode !== "none") {
    await importDemoFoodCatalog(prisma, catalogMode);
    if (catalogMode === "full") {
      await importDemoRecipes(prisma);
    }
  }

  const superAdmin = await upsertUser(prisma, {
    email: DEMO_EMAILS.superAdmin,
    passwordHash,
    firstName: "Sam",
    lastName: "Admin",
    platformRole: "ADMIN",
  });
  const platformAdmin = await upsertUser(prisma, {
    email: DEMO_EMAILS.platformAdmin,
    passwordHash,
    firstName: "Pat",
    lastName: "Moderator",
    platformRole: "ADMIN",
  });

  const aliceUser = await upsertUser(prisma, {
    email: DEMO_EMAILS.alice,
    passwordHash,
    firstName: "Alice",
    lastName: "Nguyen",
  });
  const bobUser = await upsertUser(prisma, {
    email: DEMO_EMAILS.bob,
    passwordHash,
    firstName: "Bob",
    lastName: "Okonkwo",
  });
  const charlieUser = await upsertUser(prisma, {
    email: DEMO_EMAILS.charlie,
    passwordHash,
    firstName: "Charlie",
    lastName: "Silva",
  });

  const aliceId = await ensurePractice(prisma, aliceUser.id, DEMO_PRACTICES.alice);
  const bobId = await ensurePractice(prisma, bobUser.id, DEMO_PRACTICES.bob);
  const charlieId = await ensurePractice(prisma, charlieUser.id, DEMO_PRACTICES.charlie);
  await applyAliceHarborSettings(prisma, aliceId);

  await ensureSubscription(prisma, aliceId, DEMO_PRACTICES.alice.planSlug);
  await ensureSubscription(prisma, bobId, DEMO_PRACTICES.bob.planSlug);
  await ensureSubscription(prisma, charlieId, DEMO_PRACTICES.charlie.planSlug);

  // Alice (Standard): client limit override to 6 so demo is near-limit with 4 clients.
  const clientLimitFeature = await prisma.feature.findUniqueOrThrow({
    where: { key: FEATURE_KEYS.CLIENT_LIMIT },
  });
  await prisma.featureOverride.upsert({
    where: {
      dietitianAccountId_featureId: { dietitianAccountId: aliceId, featureId: clientLimitFeature.id },
    },
    update: { enabled: true, limitValue: 6, reason: "Demo near-limit for Standard plan" },
    create: {
      dietitianAccountId: aliceId,
      featureId: clientLimitFeature.id,
      enabled: true,
      limitValue: 6,
      reason: "Demo near-limit for Standard plan",
      createdById: aliceUser.id,
    },
  });

  const customSource = await prisma.foodSource.upsert({
    where: { key: "practice-custom" },
    update: {},
    create: {
      key: "practice-custom",
      name: "Practice custom foods",
      provider: "Dietitian practice",
      datasetVersion: "1",
      license: "Practice-owned. Not a USDA dataset.",
      attribution: "Custom foods created by dietitians for their own practice.",
      importedAt: new Date(),
      status: "ACTIVE",
    },
  });

  let catalogFood = await prisma.food.findFirst({
    where: { dietitianAccountId: null, status: "ACTIVE", NOT: { foodSourceId: customSource.id } },
    orderBy: { name: "asc" },
  });
  if (!catalogFood) {
    const demoSource = await prisma.foodSource.upsert({
      where: { key: "demo-fallback" },
      update: {},
      create: {
        key: "demo-fallback",
        name: "Demo fallback foods",
        provider: "Demo",
        datasetVersion: "1",
        license: "Demo",
        attribution: "Demo seed",
        importedAt: new Date(),
        status: "ACTIVE",
      },
    });
    catalogFood = await prisma.food.create({
      data: {
        foodSourceId: demoSource.id,
        sourceFoodId: "demo-chicken-breast",
        name: "Demo Chicken Breast",
        nameNormalized: "demo chicken breast",
        status: "ACTIVE",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 165,
        proteinG: 31,
        carbohydrateG: 0,
        fatG: 3.6,
        fiberG: 0,
        importedAt: new Date(),
      },
    });
  }

  const aliceCustom = await prisma.food.create({
    data: {
      foodSourceId: customSource.id,
      sourceFoodId: randomUUID(),
      dietitianAccountId: aliceId,
      name: "Harbor Protein Smoothie Base",
      nameNormalized: "harbor protein smoothie base",
      status: "ACTIVE",
      referenceQuantity: 100,
      referenceUnit: "g",
      energyKcal: 120,
      proteinG: 18,
      carbohydrateG: 6,
      fatG: 2,
      fiberG: 1,
      servingDescription: "1 scoop prepared",
      importedAt: new Date(),
    },
  });
  const aliceElectrolyte = await prisma.food.create({
    data: {
      foodSourceId: customSource.id,
      sourceFoodId: randomUUID(),
      dietitianAccountId: aliceId,
      name: "Harbor Electrolyte Mix",
      nameNormalized: "harbor electrolyte mix",
      status: "ACTIVE",
      referenceQuantity: 100,
      referenceUnit: "ml",
      energyKcal: 12,
      proteinG: 0,
      carbohydrateG: 3,
      fatG: 0,
      fiberG: 0,
      sugarG: 2.5,
      sodiumMg: 220,
      servingDescription: "100 ml prepared",
      importedAt: new Date(),
    },
  });
  const aliceOil = await prisma.food.create({
    data: {
      foodSourceId: customSource.id,
      sourceFoodId: randomUUID(),
      dietitianAccountId: aliceId,
      name: "Harbor Extra Virgin Olive Oil",
      nameNormalized: "harbor extra virgin olive oil",
      status: "ACTIVE",
      referenceQuantity: 100,
      referenceUnit: "g",
      energyKcal: 884,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 100,
      fiberG: 0,
      servingDescription: "1 tsp ≈ 5 g",
      importedAt: new Date(),
    },
  });
  const harborPantry = await pickHarborPantry(prisma, catalogFood, aliceCustom, aliceElectrolyte, aliceOil);
  const bobCustom = await prisma.food.create({
    data: {
      foodSourceId: customSource.id,
      sourceFoodId: randomUUID(),
      dietitianAccountId: bobId,
      name: "Cedar Spiced Oat Blend",
      nameNormalized: "cedar spiced oat blend",
      status: "ACTIVE",
      referenceQuantity: 100,
      referenceUnit: "g",
      energyKcal: 380,
      proteinG: 12,
      carbohydrateG: 64,
      fatG: 8,
      fiberG: 9,
      servingDescription: "dry mix, 40g scoop",
      importedAt: new Date(),
    },
  });

  await completeHarborPantryNutrition(prisma, aliceId, aliceUser.id, harborPantry);

  const aliceRecipe = await prisma.recipe.create({
    data: {
      dietitianAccountId: aliceId,
      name: "Harbor Power Bowl",
      status: "ACTIVE",
      servings: 2,
      description:
        "Alice’s go-to training bowl for Emma: rice, roasted chicken, broccoli, olive oil. Double batch for lunch leftovers.",
      instructions:
        "Cook rice. Sear chicken. Steam broccoli. Toss with olive oil and a pinch of salt. Pack half for lunch, half for dinner on strength days.",
      createdById: aliceUser.id,
      ingredients: {
        create: [
          {
            dietitianAccountId: aliceId,
            foodId: harborPantry.rice.id,
            quantity: 70,
            unit: "g",
            sortOrder: 0,
            displayNote: "Cooked rice",
          },
          {
            dietitianAccountId: aliceId,
            foodId: harborPantry.chicken.id,
            quantity: 120,
            unit: "g",
            sortOrder: 1,
            displayNote: "Roasted breast",
          },
          {
            dietitianAccountId: aliceId,
            foodId: harborPantry.broccoli.id,
            quantity: 100,
            unit: "g",
            sortOrder: 2,
          },
          {
            dietitianAccountId: aliceId,
            foodId: harborPantry.oil.id,
            quantity: 8,
            unit: "g",
            sortOrder: 3,
          },
        ],
      },
    },
  });
  const bobRecipe = await prisma.recipe.create({
    data: {
      dietitianAccountId: bobId,
      name: "Cedar Overnight Oats",
      status: "ACTIVE",
      servings: 1,
      description: "Bob practice recipe — isolated to Cedar Wellness",
      createdById: bobUser.id,
      ingredients: {
        create: [
          {
            dietitianAccountId: bobId,
            foodId: bobCustom.id,
            quantity: 40,
            unit: "g",
            sortOrder: 0,
          },
          {
            dietitianAccountId: bobId,
            foodId: catalogFood.id,
            quantity: 50,
            unit: "g",
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const emma = await createClientWithPortal(prisma, {
    dietitianAccountId: aliceId,
    createdById: aliceUser.id,
    firstName: "Emma",
    lastName: "Rodriguez",
    email: DEMO_EMAILS.patients.emma,
    passwordHash,
    sex: "FEMALE",
    dateOfBirth: emmaDateOfBirth(),
    phone: "+1 415 555 0188",
    notes:
      "Marathon training — Harbor Nutrition only. Product designer at Northbeam. Partner Sam shares dinners. Peak block into taper.",
    allergies: "Seasonal pollen (mild) — not food",
    intolerances: "None known",
    lifestyle: "Runs 5–6 days/week; 5:15 wake on long-run Sundays; hybrid desk job Tue–Thu",
    emergencyContactName: "Sam Parent",
    emergencyContactPhone: "+1 415 555 0142",
    clinicalData: emmaClinicalData(),
    goalTitle: "Race weight 58 kg",
    goalDescription: "Arrive at the marathon start at 58 kg without losing hill power. Sub-3:30 Boston attempt.",
    goalTargetValue: 58,
    goalTargetUnit: "kg",
    tags: ["athlete", "harbor-priority"],
    chartNotes: EMMA_CHART_NOTES.map((note) => ({
      kind: note.kind,
      body: note.body,
      mealSlot: note.mealSlot,
      notedAt: daysAgo(note.daysAgo),
    })),
  });
  const james = await createClientWithPortal(prisma, {
    dietitianAccountId: aliceId,
    createdById: aliceUser.id,
    firstName: "James",
    lastName: "Chen",
    email: DEMO_EMAILS.patients.james,
    passwordHash,
    sex: "MALE",
    notes: "Prediabetes education",
    allergies: "",
    intolerances: "Lactose — prefers lactose-free dairy",
    lifestyle: "Desk job; walks 20 min lunch",
    clinicalData: {
      visit: {
        reason: "Prediabetes nutrition education",
        expectations: "Lower fasting glucose; practical meal structure",
        clinicalAims: "medical_support",
        clinicalAimsNotes: "A1C under 5.7",
        other: "",
      },
      lifestyle: {
        bowelHabits: "regular",
        bowelHabitsNotes: "",
        sleepQuality: "fair",
        sleepQualityNotes: "Screens late",
        smoking: "never",
        smokingNotes: "",
        alcohol: "weekly",
        alcoholNotes: "2–3 drinks weekends",
        maritalStatus: "married",
        maritalStatusNotes: "",
        physicalActivity: "light",
        physicalActivityNotes: "Lunch walks",
        background: "",
        other: "",
      },
      health: {
        conditions: "",
        conditionsNotes: "Prediabetes; BP borderline",
        medication: "None",
        personalHistory: "",
        familyHistory: "Father type 2 diabetes",
        other: "",
      },
      eating: {
        usualWakeTime: "07:00",
        usualBedTime: "23:30",
        dietTypes: "",
        dietTypesNotes: "",
        preferredFoods: "Rice bowls, noodles",
        dislikedFoods: "",
        allergies: "",
        allergiesNotes: "",
        intolerances: "",
        intolerancesNotes: "Lactose — lactose-free milk/yogurt",
      },
      nutrition: {
        deficiencies: "",
        deficienciesNotes: "",
        waterIntake: "about_1_2l",
        other: "Aim fiber 25–30g/day",
      },
    },
    goalTitle: "A1C under 5.7",
    tags: ["metabolic"],
    chartNotes: [
      {
        kind: "CLINICAL",
        body: "Reviewed plate method; swap sugary drinks for water or sparkling.",
        notedAt: daysAgo(8),
      },
      {
        kind: "EATING_HABIT",
        body: "Late-night snacks 3–4 nights/week — plan protein + fiber evening meal.",
        notedAt: daysAgo(4),
      },
    ],
  });
  const olivia = await createClientWithPortal(prisma, {
    dietitianAccountId: aliceId,
    createdById: aliceUser.id,
    firstName: "Olivia",
    lastName: "Park",
    email: DEMO_EMAILS.patients.olivia,
    passwordHash,
    sex: "FEMALE",
    notes: "Postpartum return to training",
    clinicalData: {
      visit: {
        reason: "Postpartum return to strength training",
        expectations: "Energy and milk supply while rebuilding training",
        clinicalAims: "energy",
        clinicalAimsNotes: "Gradual training load",
        other: "",
      },
      lifestyle: {
        bowelHabits: "irregular",
        bowelHabitsNotes: "Improving after birth",
        sleepQuality: "disrupted",
        sleepQualityNotes: "Night feeds",
        smoking: "never",
        smokingNotes: "",
        alcohol: "never",
        alcoholNotes: "Breastfeeding",
        maritalStatus: "married",
        maritalStatusNotes: "",
        physicalActivity: "light",
        physicalActivityNotes: "Walking + light PT",
        background: "",
        other: "",
      },
      health: {
        conditions: "",
        conditionsNotes: "6 months postpartum",
        medication: "Prenatal vitamin continued",
        personalHistory: "Vaginal delivery, uncomplicated",
        familyHistory: "",
        other: "",
      },
      eating: {
        usualWakeTime: "06:00",
        usualBedTime: "22:30",
        dietTypes: "",
        dietTypesNotes: "",
        preferredFoods: "Eggs, oatmeal, fruit, soups",
        dislikedFoods: "",
        allergies: "",
        allergiesNotes: "",
        intolerances: "",
        intolerancesNotes: "",
      },
      nutrition: {
        deficiencies: "",
        deficienciesNotes: "Watch iron and calcium",
        waterIntake: "about_2_3l",
        other: "Prioritize protein at each meal",
      },
    },
    goalTitle: "Rebuild strength",
    tags: ["postpartum"],
    chartNotes: [
      {
        kind: "PREGNANCY",
        body: "Postpartum week 24 — breastfeeding; energy dips mid-afternoon.",
        notedAt: daysAgo(10),
      },
      {
        kind: "MEAL",
        body: "Added Greek yogurt + berries snack after lunch — helped afternoon fatigue.",
        mealSlot: "SNACK",
        notedAt: daysAgo(1),
      },
    ],
  });
  const daniel = await createClientWithPortal(prisma, {
    dietitianAccountId: aliceId,
    createdById: aliceUser.id,
    firstName: "Daniel",
    lastName: "Kim",
    email: DEMO_EMAILS.patients.daniel,
    passwordHash,
    sex: "MALE",
    notes: "Shift-work sleep hygiene",
    lifestyle: "Night shifts every other week",
    clinicalData: {
      visit: {
        reason: "Shift-work eating and sleep",
        expectations: "More consistent bedtime and meal timing",
        clinicalAims: "energy",
        clinicalAimsNotes: "",
        other: "",
      },
      lifestyle: {
        bowelHabits: "irregular",
        bowelHabitsNotes: "",
        sleepQuality: "disrupted",
        sleepQualityNotes: "Rotating nights",
        smoking: "former",
        smokingNotes: "Quit 2 years ago",
        alcohol: "occasional",
        alcoholNotes: "",
        maritalStatus: "single",
        maritalStatusNotes: "",
        physicalActivity: "light",
        physicalActivityNotes: "Gym on off days",
        background: "",
        other: "",
      },
      health: {
        conditions: "",
        conditionsNotes: "",
        medication: "None",
        personalHistory: "",
        familyHistory: "",
        other: "",
      },
      eating: {
        usualWakeTime: "",
        usualBedTime: "",
        dietTypes: "",
        dietTypesNotes: "Irregular meal times on nights",
        preferredFoods: "Sandwiches, coffee, rice",
        dislikedFoods: "",
        allergies: "",
        allergiesNotes: "",
        intolerances: "",
        intolerancesNotes: "",
      },
      nutrition: {
        deficiencies: "",
        deficienciesNotes: "",
        waterIntake: "under_1l",
        other: "Caffeine cutoff before day sleep",
      },
    },
    goalTitle: "Consistent bedtime",
    tags: ["shift-work"],
    chartNotes: [
      {
        kind: "CLINICAL",
        body: "Plan main meal before night shift; light snack mid-shift only.",
        notedAt: daysAgo(6),
      },
    ],
  });

  const sharedUser = await upsertUser(prisma, {
    email: DEMO_EMAILS.sharedPatient,
    passwordHash,
    firstName: "Maya",
    lastName: "Thompson",
  });
  const sharedAlice = await createClientWithPortal(prisma, {
    dietitianAccountId: aliceId,
    createdById: aliceUser.id,
    firstName: "Maya",
    lastName: "Thompson",
    email: DEMO_EMAILS.sharedPatient,
    passwordHash,
    sex: "FEMALE",
    notes: "SHARED PATIENT — Alice connection (Harbor meal plans only)",
    goalTitle: "Harbor: lean mass gain",
    tags: ["shared", "harbor"],
    existingUserId: sharedUser.id,
  });
  // createClientWithPortal with existingUserId still creates a new ClientAccount — good.
  // But upsertUser already ran; createClientWithPortal with existingUserId skips second user create.
  // Problem: createClientWithPortal creates ClientAccount - if we call twice for same user+practice it fails.
  // For Bob connection:

  const sharedBob = await createClientWithPortal(prisma, {
    dietitianAccountId: bobId,
    createdById: bobUser.id,
    firstName: "Maya",
    lastName: "Thompson",
    email: DEMO_EMAILS.sharedPatient,
    passwordHash,
    sex: "FEMALE",
    notes: "SHARED PATIENT — Bob connection (Cedar meal plans only)",
    goalTitle: "Cedar: fat loss phase",
    tags: ["shared", "cedar"],
    existingUserId: sharedUser.id,
  });

  const noah = await createClientWithPortal(prisma, {
    dietitianAccountId: bobId,
    createdById: bobUser.id,
    firstName: "Noah",
    lastName: "Williams",
    email: DEMO_EMAILS.patients.noah,
    passwordHash,
    sex: "MALE",
    notes: "Cedar Wellness primary — obesity program",
    goalTitle: "Lose 8 kg in 16 weeks",
    tags: ["weight-loss", "cedar"],
  });
  await createClientWithPortal(prisma, {
    dietitianAccountId: bobId,
    createdById: bobUser.id,
    firstName: "Sophia",
    lastName: "Martinez",
    email: DEMO_EMAILS.patients.sophia,
    passwordHash,
    sex: "FEMALE",
    notes: "PCOS nutrition",
    goalTitle: "Cycle regularity support",
    tags: ["pcos"],
  });
  await createClientWithPortal(prisma, {
    dietitianAccountId: bobId,
    createdById: bobUser.id,
    firstName: "Liam",
    lastName: "Anderson",
    email: DEMO_EMAILS.patients.liam,
    passwordHash,
    sex: "MALE",
    notes: "Plant-forward transition",
    goalTitle: "Iron-replete vegan pattern",
    tags: ["plant-based"],
  });

  const ava = await createClientWithPortal(prisma, {
    dietitianAccountId: charlieId,
    createdById: charlieUser.id,
    firstName: "Ava",
    lastName: "Patel",
    email: DEMO_EMAILS.patients.ava,
    passwordHash,
    sex: "FEMALE",
    notes: "Lumen Dietetics — IBS low-FODMAP",
    goalTitle: "Symptom-free dining out",
    tags: ["ibs", "lumen"],
  });
  await createClientWithPortal(prisma, {
    dietitianAccountId: charlieId,
    createdById: charlieUser.id,
    firstName: "Ethan",
    lastName: "Brooks",
    email: DEMO_EMAILS.patients.ethan,
    passwordHash,
    sex: "MALE",
    notes: "Crohn’s remission maintenance",
    goalTitle: "Maintain remission",
    tags: ["gi"],
  });
  await createClientWithPortal(prisma, {
    dietitianAccountId: charlieId,
    createdById: charlieUser.id,
    firstName: "Isabella",
    lastName: "Nguyen",
    email: DEMO_EMAILS.patients.isabella,
    passwordHash,
    sex: "FEMALE",
    notes: "GERD trigger mapping",
    goalTitle: "Night reflux free",
    tags: ["gerd"],
  });

  // Measurements / evolution for Emma & Noah
  for (const [week, weight] of [
    [28, 62.4],
    [21, 61.8],
    [14, 61.1],
    [7, 60.5],
    [0, 59.9],
  ] as const) {
    await prisma.clientMeasurement.create({
      data: {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        type: "WEIGHT",
        value: weight,
        unit: "kg",
        measuredAt: daysAgo(week),
        recordedById: aliceUser.id,
      },
    });
  }
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "HEIGHT",
      value: 168,
      unit: "cm",
      measuredAt: daysAgo(40),
      recordedById: aliceUser.id,
    },
  });
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "WAIST",
      value: 72,
      unit: "cm",
      measuredAt: daysAgo(7),
      recordedById: aliceUser.id,
    },
  });
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "HIPS",
      value: 98,
      unit: "cm",
      measuredAt: daysAgo(7),
      recordedById: aliceUser.id,
    },
  });
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "BODY_FAT",
      value: 28.4,
      unit: "%",
      measuredAt: daysAgo(7),
      recordedById: aliceUser.id,
    },
  });
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "FAT_MASS",
      value: 17.0,
      unit: "kg",
      measuredAt: daysAgo(7),
      recordedById: aliceUser.id,
    },
  });
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "MUSCLE_MASS",
      value: 23.5,
      unit: "kg",
      measuredAt: daysAgo(7),
      recordedById: aliceUser.id,
    },
  });
  for (const [type, value] of [
    ["SKINFOLD_ABDOMINAL", 25],
    ["SKINFOLD_CHEST", 10],
    ["SKINFOLD_FRONT_THIGH", 15],
    ["SKINFOLD_MIDAXILLARY", 12],
    ["SKINFOLD_SUBSCAPULAR", 12],
    ["SKINFOLD_SUPRAILIAC", 14],
    ["SKINFOLD_TRICEPS", 12],
  ] as const) {
    await prisma.clientMeasurement.create({
      data: {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        type,
        value,
        unit: "mm",
        measuredAt: daysAgo(7),
        recordedById: aliceUser.id,
      },
    });
  }
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "BP_SYSTOLIC",
      value: 118,
      unit: "mmHg",
      measuredAt: daysAgo(14),
      recordedById: aliceUser.id,
    },
  });
  await prisma.clientMeasurement.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      type: "BP_DIASTOLIC",
      value: 76,
      unit: "mmHg",
      measuredAt: daysAgo(14),
      recordedById: aliceUser.id,
    },
  });
  for (const [days, waist, hips, fat] of [
    [28, 74.2, 99.4, 29.6],
    [21, 73.4, 99.0, 29.1],
    [14, 72.8, 98.4, 28.8],
    [0, 71.6, 97.6, 27.9],
  ] as const) {
    await prisma.clientMeasurement.createMany({
      data: [
        {
          dietitianAccountId: aliceId,
          clientId: emma.client.id,
          type: "WAIST",
          value: waist,
          unit: "cm",
          measuredAt: daysAgo(days),
          recordedById: aliceUser.id,
        },
        {
          dietitianAccountId: aliceId,
          clientId: emma.client.id,
          type: "HIPS",
          value: hips,
          unit: "cm",
          measuredAt: daysAgo(days),
          recordedById: aliceUser.id,
        },
        {
          dietitianAccountId: aliceId,
          clientId: emma.client.id,
          type: "BODY_FAT",
          value: fat,
          unit: "%",
          measuredAt: daysAgo(days),
          recordedById: aliceUser.id,
        },
      ],
    });
  }
  for (const [days, arm, thigh, chest] of [
    [40, 26.2, 54.8, 86.4],
    [7, 26.0, 54.1, 85.8],
  ] as const) {
    await prisma.clientMeasurement.createMany({
      data: [
        {
          dietitianAccountId: aliceId,
          clientId: emma.client.id,
          type: "ARM",
          value: arm,
          unit: "cm",
          measuredAt: daysAgo(days),
          recordedById: aliceUser.id,
        },
        {
          dietitianAccountId: aliceId,
          clientId: emma.client.id,
          type: "THIGH",
          value: thigh,
          unit: "cm",
          measuredAt: daysAgo(days),
          recordedById: aliceUser.id,
        },
        {
          dietitianAccountId: aliceId,
          clientId: emma.client.id,
          type: "CHEST",
          value: chest,
          unit: "cm",
          measuredAt: daysAgo(days),
          recordedById: aliceUser.id,
        },
      ],
    });
  }
  await prisma.clientMeasurement.createMany({
    data: [
      {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        type: "CHOLESTEROL_TOTAL",
        value: 178,
        unit: "mg/dL",
        measuredAt: daysAgo(40),
        recordedById: aliceUser.id,
        notes: "Intake labs",
      },
      {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        type: "CHOLESTEROL_HDL",
        value: 62,
        unit: "mg/dL",
        measuredAt: daysAgo(40),
        recordedById: aliceUser.id,
      },
      {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        type: "CHOLESTEROL_LDL",
        value: 98,
        unit: "mg/dL",
        measuredAt: daysAgo(40),
        recordedById: aliceUser.id,
      },
      {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        type: "TRIGLYCERIDES",
        value: 85,
        unit: "mg/dL",
        measuredAt: daysAgo(40),
        recordedById: aliceUser.id,
      },
    ],
  });
  for (const [week, weight] of [
    [28, 98.2],
    [21, 96.5],
    [14, 95.1],
    [7, 93.8],
    [0, 92.4],
  ] as const) {
    await prisma.clientMeasurement.create({
      data: {
        dietitianAccountId: bobId,
        clientId: noah.client.id,
        type: "WEIGHT",
        value: weight,
        unit: "kg",
        measuredAt: daysAgo(week),
        recordedById: bobUser.id,
      },
    });
  }

  // Assessments
  const aliceTemplate = await prisma.assessmentTemplate.create({
    data: {
      dietitianAccountId: aliceId,
      name: "Harbor Intake",
      description: "Initial lifestyle, training load, and race-fueling assessment",
      status: "ACTIVE",
      version: 1,
      createdById: aliceUser.id,
      schema: HARBOR_INTAKE_SCHEMA as Prisma.InputJsonValue,
    },
  });
  const schemaSnapshot = aliceTemplate.schema;
  await prisma.assessment.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      templateId: aliceTemplate.id,
      templateVersion: 1,
      status: "COMPLETED",
      schemaSnapshot: schemaSnapshot as Prisma.InputJsonValue,
      responses: HARBOR_INTAKE_RESPONSES as Prisma.InputJsonValue,
      startedAt: daysAgo(30),
      completedAt: daysAgo(29),
      createdById: aliceUser.id,
    },
  });
  await prisma.assessment.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: emma.client.id,
      templateId: aliceTemplate.id,
      templateVersion: 1,
      status: "IN_PROGRESS",
      schemaSnapshot: schemaSnapshot as Prisma.InputJsonValue,
      responses: {
        goal: "Hold race weight through taper",
        energy: 7,
        long_run: "28 km yesterday",
        sleep: 7,
      } as Prisma.InputJsonValue,
      startedAt: daysAgo(1),
      createdById: aliceUser.id,
    },
  });

  // Meal plans: Emma 14-day published + draft; Noah 7-day; Ava 21-day draft; shared Alice/Bob different plans
  const emmaPlan = await createEmmaRacePrepPlan(prisma, {
    dietitianAccountId: aliceId,
    clientId: emma.client.id,
    createdById: aliceUser.id,
    pantry: harborPantry,
    recipeId: aliceRecipe.id,
    recipeName: aliceRecipe.name,
  });
  await createDraftPlan(prisma, {
    dietitianAccountId: aliceId,
    clientId: james.client.id,
    createdById: aliceUser.id,
    name: "James Metabolic Draft",
    dayCount: 7,
    foodId: catalogFood.id,
  });
  await createPublishedPlan(prisma, {
    dietitianAccountId: bobId,
    clientId: noah.client.id,
    createdById: bobUser.id,
    name: "Noah Fat-Loss Week",
    dayCount: 7,
    foodId: catalogFood.id,
    foodName: catalogFood.name,
    recipeId: bobRecipe.id,
    recipeName: bobRecipe.name,
  });
  await createDraftPlan(prisma, {
    dietitianAccountId: charlieId,
    clientId: ava.client.id,
    createdById: charlieUser.id,
    name: "Ava Low-FODMAP 21-day",
    dayCount: 21,
    foodId: catalogFood.id,
  });
  await createPublishedPlan(prisma, {
    dietitianAccountId: aliceId,
    clientId: sharedAlice.client.id,
    createdById: aliceUser.id,
    name: "Maya @ Harbor — Hypertrophy",
    dayCount: 7,
    foodId: catalogFood.id,
    foodName: catalogFood.name,
    recipeId: aliceRecipe.id,
    recipeName: "Harbor Power Bowl",
  });
  await createPublishedPlan(prisma, {
    dietitianAccountId: bobId,
    clientId: sharedBob.client.id,
    createdById: bobUser.id,
    name: "Maya @ Cedar — Cut Phase",
    dayCount: 7,
    foodId: catalogFood.id,
    foodName: catalogFood.name,
    recipeId: bobRecipe.id,
    recipeName: "Cedar Overnight Oats",
  });
  await createPublishedPlan(prisma, {
    dietitianAccountId: aliceId,
    clientId: olivia.client.id,
    createdById: aliceUser.id,
    name: "Olivia Postpartum 28-day",
    dayCount: 28,
    foodId: catalogFood.id,
    foodName: catalogFood.name,
  });

  await seedEmmaTracking(prisma, {
    dietitianAccountId: aliceId,
    clientId: emma.client.id,
    pantry: harborPantry,
    planVersionId: emmaPlan.versionId,
    breakfastMealId: emmaPlan.breakfastMealId ?? undefined,
  });

  // Appointments
  await seedEmmaAppointments(prisma, {
    dietitianAccountId: aliceId,
    aliceUserId: aliceUser.id,
    emmaClientId: emma.client.id,
    emmaUserId: emma.user.id,
  });
  await prisma.appointment.create({
    data: {
      dietitianAccountId: aliceId,
      clientId: james.client.id,
      assignedUserId: aliceUser.id,
      title: "Cancelled lab review",
      category: "ASSESSMENT",
      startAt: daysAgo(1),
      endAt: new Date(daysAgo(1).getTime() + 30 * 60_000),
      status: "CANCELLED",
      notes: "Client travel",
      createdById: aliceUser.id,
    },
  });
  await prisma.appointment.create({
    data: {
      dietitianAccountId: bobId,
      clientId: noah.client.id,
      assignedUserId: bobUser.id,
      title: "Reschedule pending weigh-in",
      category: "FOLLOW_UP",
      startAt: daysFromNow(2),
      endAt: new Date(daysFromNow(2).getTime() + 45 * 60_000),
      status: "RESCHEDULE_PENDING",
      proposedStartAt: daysFromNow(3),
      proposedEndAt: new Date(daysFromNow(3).getTime() + 45 * 60_000),
      proposedByUserId: sharedUser.id,
      createdById: bobUser.id,
    },
  });

  // Messaging
  const { conversationId: emmaConvoId } = await seedEmmaMessages(prisma, {
    dietitianAccountId: aliceId,
    clientId: emma.client.id,
    aliceUserId: aliceUser.id,
    emmaUserId: emma.user.id,
  });

  const noahConvo = await prisma.conversation.create({
    data: { dietitianAccountId: bobId, clientId: noah.client.id, status: "ACTIVE" },
  });
  const noahMessage = await prisma.message.create({
    data: {
      conversationId: noahConvo.id,
      dietitianAccountId: bobId,
      clientId: noah.client.id,
      senderUserId: noah.user.id,
      body: "Bob — grocery list for the oat blend?",
      createdAt: hoursAgo(5),
    },
  });
  await prisma.conversation.update({
    where: { id: noahConvo.id },
    data: {
      lastMessageId: noahMessage.id,
      lastMessageAt: noahMessage.createdAt,
      lastMessagePreview: noahMessage.body.slice(0, 120),
    },
  });

  // Notifications
  await prisma.notification.createMany({
    data: [
      {
        dietitianAccountId: aliceId,
        userId: emma.user.id,
        clientId: emma.client.id,
        type: "MEAL_PLAN_PUBLISHED",
        title: "New meal plan published",
        body: "Emma Race Prep — 14 days is ready to view.",
        targetType: "meal_plan",
        targetId: emmaPlan.planId,
      },
      {
        dietitianAccountId: aliceId,
        userId: aliceUser.id,
        clientId: emma.client.id,
        type: "NEW_MESSAGE",
        title: "New message from Emma",
        body: "Perfect. Sleep was 7h last night. Weight this morning 59.9…",
        targetType: "conversation",
        targetId: emmaConvoId,
      },
      {
        dietitianAccountId: bobId,
        userId: bobUser.id,
        clientId: noah.client.id,
        type: "NEW_MESSAGE",
        title: "New message from Noah",
        body: "Bob — grocery list for the oat blend?",
        targetType: "conversation",
        targetId: noahConvo.id,
      },
      {
        dietitianAccountId: aliceId,
        userId: emma.user.id,
        clientId: emma.client.id,
        type: "APPOINTMENT_CREATED",
        title: "Appointment scheduled",
        body: "Today — fueling review",
        targetType: "appointment",
      },
    ],
  });

  // Documents (real files when FILE_STORAGE_PATH set)
  await seedDocuments(prisma, {
    dietitianAccountId: aliceId,
    clientId: emma.client.id,
    uploadedByUserId: aliceUser.id,
    label: "harbor-race-prep",
    filename: "Emma-Rodriguez-race-prep-notes.txt",
    body: HARBOR_DOCUMENT_BODY,
  });
  await seedDocuments(prisma, {
    dietitianAccountId: bobId,
    clientId: noah.client.id,
    uploadedByUserId: bobUser.id,
    label: "cedar",
  });

  // Invoices
  await seedInvoices(prisma, {
    dietitianAccountId: aliceId,
    clientId: emma.client.id,
    createdById: aliceUser.id,
    prefix: "HN",
  });
  await seedInvoices(prisma, {
    dietitianAccountId: bobId,
    clientId: noah.client.id,
    createdById: bobUser.id,
    prefix: "CW",
  });

  // Tasks
  await prisma.task.createMany({
    data: [
      {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        title: "Pack Emma race-vest grocery list",
        status: "TODO",
        priority: "HIGH",
        dueAt: daysFromNow(1),
        createdById: aliceUser.id,
      },
      {
        dietitianAccountId: aliceId,
        clientId: emma.client.id,
        title: "Review Sunday 32k fueling log",
        status: "COMPLETED",
        priority: "NORMAL",
        completedAt: daysAgo(2),
        createdById: aliceUser.id,
      },
      {
        dietitianAccountId: aliceId,
        title: "Update Harbor smoothie recipe macros",
        status: "IN_PROGRESS",
        priority: "NORMAL",
        createdById: aliceUser.id,
      },
      {
        dietitianAccountId: aliceId,
        clientId: james.client.id,
        title: "Send James lab reminder",
        status: "COMPLETED",
        priority: "LOW",
        completedAt: daysAgo(2),
        createdById: aliceUser.id,
      },
      {
        dietitianAccountId: bobId,
        clientId: noah.client.id,
        title: "Overdue: Noah grocery education",
        status: "TODO",
        priority: "URGENT",
        dueAt: daysAgo(2),
        createdById: bobUser.id,
      },
      {
        dietitianAccountId: charlieId,
        clientId: ava.client.id,
        title: "Cancelled: Ava restaurant challenge",
        status: "CANCELLED",
        priority: "NORMAL",
        createdById: charlieUser.id,
      },
    ],
  });

  // Automation rules (Bob/Charlie have AUTOMATION; Alice Standard does not)
  await prisma.automationRule.create({
    data: {
      dietitianAccountId: bobId,
      name: "Invoice overdue → task",
      status: "ACTIVE",
      triggerType: "INVOICE_OVERDUE",
      actionType: "CREATE_TASK",
      configuration: {
        recipient: "ASSIGNED_DIETITIAN",
        timing: { daysOverdue: 1 },
        taskTitle: "Follow up overdue invoice for {{client.displayName}}",
        taskPriority: "HIGH",
      },
      createdById: bobUser.id,
    },
  });
  await prisma.automationRule.create({
    data: {
      dietitianAccountId: bobId,
      name: "Appointment upcoming → notify",
      status: "ACTIVE",
      triggerType: "APPOINTMENT_UPCOMING",
      actionType: "SEND_IN_APP_NOTIFICATION",
      configuration: {
        recipient: "ASSIGNED_DIETITIAN",
        timing: { daysBefore: 1 },
        notificationTitle: "Upcoming appointment",
        notificationBody: "{{client.firstName}} has an appointment soon",
      },
      createdById: bobUser.id,
    },
  });
  await prisma.automationRule.create({
    data: {
      dietitianAccountId: charlieId,
      name: "Meal plan ending → client notify",
      status: "ACTIVE",
      triggerType: "MEAL_PLAN_ENDING",
      actionType: "CREATE_CLIENT_NOTIFICATION",
      configuration: {
        recipient: "CLIENT",
        timing: { daysBefore: 3 },
        notificationTitle: "Meal plan ending soon",
        notificationBody:
          "Your plan {{mealPlan.name}} ends soon — message your dietitian for the next phase.",
      },
      createdById: charlieUser.id,
    },
  });

  if (!options.skipAi && process.env.AI_ENABLED === "true") {
    const periodKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.aiUsage.create({
      data: {
        dietitianAccountId: bobId,
        periodKey,
        requestCount: 3,
      },
    });
    await prisma.aiRequest.create({
      data: {
        dietitianAccountId: bobId,
        userId: bobUser.id,
        clientId: noah.client.id,
        action: "CLIENT_SUMMARY",
        promptVersion: "CLIENT_SUMMARY_V1",
        provider: "mock",
        status: "COMPLETED",
        completedAt: daysAgo(1),
      },
    });
  }

  // silence unused vars for clients we created for volume
  void olivia;
  void daniel;
  void james;

  return {
    password,
    users: {
      superAdminId: superAdmin.id,
      platformAdminId: platformAdmin.id,
      aliceUserId: aliceUser.id,
      bobUserId: bobUser.id,
      charlieUserId: charlieUser.id,
      sharedPatientUserId: sharedUser.id,
    },
    practices: { aliceId, bobId, charlieId },
    clients: {
      sharedAliceClientId: sharedAlice.client.id,
      sharedBobClientId: sharedBob.client.id,
      emmaClientId: emma.client.id,
      noahClientId: noah.client.id,
      avaClientId: ava.client.id,
    },
    foods: {
      catalogFoodId: catalogFood.id,
      aliceCustomFoodId: aliceCustom.id,
      bobCustomFoodId: bobCustom.id,
    },
    recipes: {
      aliceRecipeId: aliceRecipe.id,
      bobRecipeId: bobRecipe.id,
    },
    mealPlans: {
      emmaPublishedPlanId: emmaPlan.planId,
      emmaPublishedVersionId: emmaPlan.versionId,
    },
  };
}

async function createDraftPlan(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    createdById: string;
    name: string;
    dayCount: number;
    foodId: string;
  },
) {
  const plan = await prisma.mealPlan.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      name: input.name,
      status: "DRAFT",
      dayLabelMode: "NUMBERED",
      createdById: input.createdById,
    },
  });
  const version = await prisma.mealPlanVersion.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      mealPlanId: plan.id,
      versionNumber: 1,
      status: "DRAFT",
      createdById: input.createdById,
    },
  });
  for (let dayNumber = 1; dayNumber <= Math.min(input.dayCount, 3); dayNumber++) {
    const day = await prisma.mealPlanDay.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanVersionId: version.id,
        dayNumber,
      },
    });
    const meal = await prisma.meal.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanDayId: day.id,
        name: "Breakfast",
        sortOrder: 0,
      },
    });
    await prisma.mealItem.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealId: meal.id,
        itemType: "FOOD",
        foodId: input.foodId,
        quantity: 100,
        unit: "g",
        sortOrder: 0,
      },
    });
  }
  return { planId: plan.id, versionId: version.id };
}

async function createPublishedPlan(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    createdById: string;
    name: string;
    dayCount: number;
    foodId: string;
    foodName: string;
    recipeId?: string;
    recipeName?: string;
  },
) {
  const plan = await prisma.mealPlan.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      name: input.name,
      status: "ACTIVE",
      dayLabelMode: "NUMBERED",
      createdById: input.createdById,
    },
  });
  const version = await prisma.mealPlanVersion.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      mealPlanId: plan.id,
      versionNumber: 1,
      status: "PUBLISHED",
      publishedAt: daysAgo(5),
      createdById: input.createdById,
    },
  });

  const daySnapshots: Array<{
    id: string;
    dayNumber: number;
    meals: Array<{
      id: string;
      name: string;
      sortOrder: number;
      items: Array<{
        id: string;
        itemType: "FOOD" | "RECIPE";
        quantity: number;
        unit: string;
        food?: { id: string; name: string } | null;
        recipe?: { id: string; name: string; servings: number } | null;
        nutrition: Nut;
      }>;
    }>;
  }> = [];

  const daysToMaterialize = Math.min(input.dayCount, 7);
  for (let dayNumber = 1; dayNumber <= daysToMaterialize; dayNumber++) {
    const day = await prisma.mealPlanDay.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanVersionId: version.id,
        dayNumber,
      },
    });
    const breakfast = await prisma.meal.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanDayId: day.id,
        name: "Breakfast",
        sortOrder: 0,
      },
    });
    const lunch = await prisma.meal.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanDayId: day.id,
        name: "Lunch",
        sortOrder: 1,
      },
    });
    const dinner = await prisma.meal.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanDayId: day.id,
        name: "Dinner",
        sortOrder: 2,
      },
    });
    const snack = await prisma.meal.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanDayId: day.id,
        name: "Afternoon Snack",
        sortOrder: 3,
      },
    });

    const bItem = await prisma.mealItem.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealId: breakfast.id,
        itemType: input.recipeId ? "RECIPE" : "FOOD",
        foodId: input.recipeId ? null : input.foodId,
        recipeId: input.recipeId ?? null,
        quantity: input.recipeId ? 1 : 100,
        unit: input.recipeId ? "serving" : "g",
        sortOrder: 0,
      },
    });
    const lItem = await prisma.mealItem.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealId: lunch.id,
        itemType: "FOOD",
        foodId: input.foodId,
        quantity: 140,
        unit: "g",
        sortOrder: 0,
      },
    });
    const dItem = await prisma.mealItem.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealId: dinner.id,
        itemType: "FOOD",
        foodId: input.foodId,
        quantity: 160,
        unit: "g",
        sortOrder: 0,
      },
    });
    const sItem = await prisma.mealItem.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealId: snack.id,
        itemType: "FOOD",
        foodId: input.foodId,
        quantity: 40,
        unit: "g",
        sortOrder: 0,
      },
    });

    daySnapshots.push({
      id: day.id,
      dayNumber,
      meals: [
        {
          id: breakfast.id,
          name: "Breakfast",
          sortOrder: 0,
          items: [
            {
              id: bItem.id,
              itemType: input.recipeId ? "RECIPE" : "FOOD",
              quantity: input.recipeId ? 1 : 100,
              unit: input.recipeId ? "serving" : "g",
              food: input.recipeId ? null : { id: input.foodId, name: input.foodName },
              recipe: input.recipeId
                ? { id: input.recipeId, name: input.recipeName ?? "Recipe", servings: 1 }
                : null,
              nutrition: nut({ energyKcal: 350, proteinG: 28, carbohydrateG: 30, fatG: 10, fiberG: 4 }),
            },
          ],
        },
        {
          id: lunch.id,
          name: "Lunch",
          sortOrder: 1,
          items: [
            {
              id: lItem.id,
              itemType: "FOOD",
              quantity: 140,
              unit: "g",
              food: { id: input.foodId, name: input.foodName },
              nutrition: nut({ energyKcal: 230, proteinG: 43, fatG: 5 }),
            },
          ],
        },
        {
          id: dinner.id,
          name: "Dinner",
          sortOrder: 2,
          items: [
            {
              id: dItem.id,
              itemType: "FOOD",
              quantity: 160,
              unit: "g",
              food: { id: input.foodId, name: input.foodName },
              nutrition: nut({ energyKcal: 264, proteinG: 49, fatG: 6 }),
            },
          ],
        },
        {
          id: snack.id,
          name: "Afternoon Snack",
          sortOrder: 3,
          items: [
            {
              id: sItem.id,
              itemType: "FOOD",
              quantity: 40,
              unit: "g",
              food: { id: input.foodId, name: input.foodName },
              nutrition: nut({ energyKcal: 66, proteinG: 12, fatG: 1 }),
            },
          ],
        },
      ],
    });
  }

  // Placeholder days beyond materialized week (day numbers only) for 14/21/28 plans
  for (let dayNumber = daysToMaterialize + 1; dayNumber <= input.dayCount; dayNumber++) {
    await prisma.mealPlanDay.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        mealPlanVersionId: version.id,
        dayNumber,
      },
    });
  }

  const snapshot = buildMealSnapshot({
    planName: input.name,
    versionNumber: 1,
    days: daySnapshots,
  });
  await prisma.mealPlanVersion.update({
    where: { id: version.id },
    data: { snapshot },
  });

  await prisma.timelineEvent.create({
    data: {
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      type: "MEAL_PLAN_PUBLISHED",
      actorUserId: input.createdById,
      targetType: "meal_plan_version",
      targetId: version.id,
      occurredAt: daysAgo(5),
    },
  });

  return { planId: plan.id, versionId: version.id };
}

async function seedDocuments(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    uploadedByUserId: string;
    label: string;
    filename?: string;
    body?: string;
  },
) {
  const storageRoot = process.env.FILE_STORAGE_PATH
    ? path.resolve(process.env.FILE_STORAGE_PATH)
    : path.resolve(process.cwd(), "storage");
  const documentId = randomUUID();
  const storageKey = path.posix.join(
    "dietitians",
    input.dietitianAccountId,
    "clients",
    input.clientId,
    `${documentId}.txt`,
  );
  const absolute = path.join(storageRoot, storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  const body = input.body ?? `Demo ${input.label} nutrition notes for client ${input.clientId}\n`;
  const filename = input.filename ?? `${input.label}-notes.txt`;
  await writeFile(absolute, body, "utf8");
  await prisma.document.create({
    data: {
      id: documentId,
      dietitianAccountId: input.dietitianAccountId,
      clientId: input.clientId,
      uploadedByUserId: input.uploadedByUserId,
      filename,
      originalFilename: filename,
      storageKey,
      mimeType: "text/plain",
      sizeBytes: BigInt(Buffer.byteLength(body)),
      visibility: "SHARED",
      status: "ACTIVE",
      sharedAt: new Date(),
      sharedByUserId: input.uploadedByUserId,
    },
  });
}

async function seedInvoices(
  prisma: PrismaClient,
  input: {
    dietitianAccountId: string;
    clientId: string;
    createdById: string;
    prefix: string;
  },
) {
  await prisma.invoiceSequence.upsert({
    where: { dietitianAccountId: input.dietitianAccountId },
    update: { nextNumber: 10 },
    create: { dietitianAccountId: input.dietitianAccountId, nextNumber: 10 },
  });

  const statuses = [
    { status: "DRAFT" as const, number: null },
    { status: "ISSUED" as const, number: `${input.prefix}-0001` },
    { status: "SENT" as const, number: `${input.prefix}-0002` },
    { status: "PAID" as const, number: `${input.prefix}-0003` },
    { status: "OVERDUE" as const, number: `${input.prefix}-0004` },
    { status: "CANCELLED" as const, number: `${input.prefix}-0005` },
  ];

  for (const row of statuses) {
    const subtotal = 150;
    const tax = 15;
    const total = row.status === "CANCELLED" ? 0 : 165;
    const invoice = await prisma.invoice.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        clientId: input.clientId,
        invoiceNumber: row.number,
        status: row.status,
        issueDate: row.status === "DRAFT" ? null : dateOnly(daysAgo(10)),
        dueDate: row.status === "DRAFT" ? null : dateOnly(daysAgo(row.status === "OVERDUE" ? 3 : -10)),
        currency: "USD",
        subtotal,
        taxAmount: tax,
        total,
        notes: `${input.prefix} consultation package`,
        createdById: input.createdById,
        issuedAt: row.status === "DRAFT" ? null : daysAgo(10),
        sentAt: ["SENT", "PAID", "OVERDUE"].includes(row.status) ? daysAgo(9) : null,
        paidAt: row.status === "PAID" ? daysAgo(2) : null,
        cancelledAt: row.status === "CANCELLED" ? daysAgo(1) : null,
      } as Prisma.InvoiceUncheckedCreateInput,
    });
    await prisma.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        dietitianAccountId: input.dietitianAccountId,
        description:
          input.prefix === "HN"
            ? "Race-prep follow-up (45 min)"
            : "Nutrition consultation (60 min)",
        quantity: 1,
        unitPrice: 150,
        lineTotal: 150,
        sortOrder: 0,
      },
    });
  }
}
