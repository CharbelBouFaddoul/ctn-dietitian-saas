import type { PrismaClient } from "@prisma/client";
import { seedEntitlementCatalog } from "../entitlements/catalog.seed";
import { seedPlatformAssessmentTemplate } from "../assessments/platform-template.seed";
import { seedPlatformSettings } from "../platform-settings/platform-settings.seed";

/** Deletes all application rows. Caller must assert DB safety first. */
export async function wipeApplicationData(prisma: PrismaClient): Promise<void> {
  await prisma.contactSubmission.deleteMany();
  await prisma.automationRun.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.automationUsage.deleteMany();
  await prisma.aiRequest.deleteMany();
  await prisma.aiUsage.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.deleteMany();
  await prisma.task.deleteMany();
  await prisma.habitLog.deleteMany();
  await prisma.clientHabitAssignment.deleteMany();
  await prisma.habitDefinition.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationReadState.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.document.deleteMany();
  await prisma.sleepLog.deleteMany();
  await prisma.exerciseLog.deleteMany();
  await prisma.waterLog.deleteMany();
  await prisma.foodLog.deleteMany();
  await prisma.mealItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.mealPlanDay.deleteMany();
  await prisma.mealPlanVersion.deleteMany();
  await prisma.mealPlan.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.foodOverride.deleteMany();
  await prisma.timelineEvent.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.clientMeasurement.deleteMany();
  await prisma.clientGoal.deleteMany();
  await prisma.clientChartNote.deleteMany();
  await prisma.clientTag.deleteMany();
  await prisma.clientProfile.deleteMany();
  await prisma.clientAssignment.deleteMany();
  await prisma.clientAccount.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.assessmentTemplate.deleteMany();
  await prisma.client.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.featureOverride.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.dietitianSettings.deleteMany();
  await prisma.dietitianAccount.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.invitationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.food.deleteMany();
  await prisma.foodSource.deleteMany();
  await prisma.planFeature.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.platformSettings.deleteMany();
}

export async function seedPlatformBootstrap(
  prisma: PrismaClient,
    options?: {
    registrationEnabled?: boolean;
    dietitianRegistrationEnabled?: boolean;
    patientRegistrationEnabled?: boolean;
    trialSignupEnabled?: boolean;
    emailVerificationRequired?: boolean;
  },
): Promise<void> {
  await seedEntitlementCatalog(prisma);
  await seedPlatformAssessmentTemplate(prisma);
  await seedPlatformSettings(prisma);
  await seedGlobalHabits(prisma);
  const both = options?.registrationEnabled ?? false;
  await prisma.platformSettings.updateMany({
    data: {
      dietitianRegistrationEnabled: options?.dietitianRegistrationEnabled ?? both,
      patientRegistrationEnabled: options?.patientRegistrationEnabled ?? both,
      emailNotificationsEnabled: false,
      plansPageEnabled: false,
      trialSignupEnabled: options?.trialSignupEnabled ?? false,
      emailVerificationRequired: options?.emailVerificationRequired ?? true,
    },
  });
}

async function seedGlobalHabits(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.habitDefinition.count({ where: { dietitianAccountId: null } });
  if (existing > 0) return;
  const now = new Date();
  await prisma.habitDefinition.createMany({
    data: [
      {
        name: "Eat vegetables",
        description: "Include vegetables with at least one meal",
        category: "nutrition",
        frequency: "DAILY",
        active: true,
        sortOrder: 10,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Take a walk",
        description: "Move for at least 10 minutes",
        category: "activity",
        defaultTargetValue: 10,
        defaultTargetUnit: "min",
        frequency: "DAILY",
        active: true,
        sortOrder: 20,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Eat breakfast",
        description: "Start the day with a planned breakfast",
        category: "nutrition",
        frequency: "DAILY",
        active: true,
        sortOrder: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Drink water goal",
        description: "Hit your daily water target",
        category: "hydration",
        frequency: "DAILY",
        active: true,
        sortOrder: 40,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Sleep on schedule",
        description: "Keep a consistent bedtime",
        category: "sleep",
        frequency: "DAILY",
        active: true,
        sortOrder: 50,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
}
