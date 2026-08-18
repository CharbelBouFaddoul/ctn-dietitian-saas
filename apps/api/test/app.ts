import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../src/auth/auth.module";
import { InvitationService } from "../src/auth/invitation.service";
import { PasswordService } from "../src/auth/password.service";
import { TokenService } from "../src/auth/token.service";
import { EmailVerificationService } from "../src/auth/email-verification.service";
import { SecurityEventLogger } from "../src/auth/security-event.logger";
import { AdminModule } from "../src/admin/admin.module";
import { EntitlementService } from "../src/entitlements/entitlement.service";
import { seedEntitlementCatalog } from "../src/entitlements/catalog.seed";
import { seedPlatformAssessmentTemplate } from "../src/assessments/platform-template.seed";
import { OrganizationModule } from "../src/organizations/organization.module";
import { OrganizationLifecycleService } from "../src/organizations/organization-lifecycle.service";
import { MembershipService } from "../src/organizations/membership.service";
import { TimelineModule } from "../src/timeline/timeline.module";
import { ClientsModule } from "../src/clients/clients.module";
import { ClientAccountsModule } from "../src/client-accounts/client-accounts.module";
import { ClientAssignmentsModule } from "../src/client-assignments/client-assignments.module";
import { ClientProfilesModule } from "../src/client-profiles/client-profiles.module";
import { ClientGoalsModule } from "../src/client-goals/client-goals.module";
import { ClientTagsModule } from "../src/client-tags/client-tags.module";
import { ClientMeasurementsModule } from "../src/client-measurements/client-measurements.module";
import { AssessmentsModule } from "../src/assessments/assessments.module";
import { AppointmentsModule } from "../src/appointments/appointments.module";
import { PracticeModule } from "../src/practice/practice.module";
import { FoodsModule } from "../src/foods/foods.module";
import { FoodOverridesModule } from "../src/food-overrides/food-overrides.module";
import { RecipesModule } from "../src/recipes/recipes.module";
import { MealPlansModule } from "../src/meal-plans/meal-plans.module";
import { TrackingModule } from "../src/tracking/tracking.module";
import { MessagingModule } from "../src/messaging/messaging.module";
import { DocumentsModule } from "../src/documents/documents.module";
import { InvoicesModule } from "../src/invoices/invoices.module";
import { TasksModule } from "../src/tasks/tasks.module";
import { AnalyticsModule } from "../src/analytics/analytics.module";
import { AiModule } from "../src/ai/ai.module";
import { AutomationModule } from "../src/automation/automation.module";
import { AppThrottlerModule } from "../src/common/app-throttler.module";
import { CommonModule } from "../src/common/common.module";
import { StorageModule } from "../src/storage/storage.module";
import { configureHttpApp } from "../src/app.setup";
import { loadEnv } from "../src/config/env";
import { EMAIL_PROVIDER } from "../src/email/email.provider";
import { EmailModule } from "../src/email/email.module";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CapturingEmailProvider } from "./capturing-email.provider";

export interface AuthTestContext {
  app: INestApplication;
  prisma: PrismaService;
  emails: CapturingEmailProvider;
  tokens: TokenService;
  passwords: PasswordService;
  invitations: InvitationService;
  verification: EmailVerificationService;
  lifecycle: OrganizationLifecycleService;
  memberships: MembershipService;
  entitlements: EntitlementService;
  security: SecurityEventLogger;
}

export async function createAuthTestApp(): Promise<AuthTestContext> {
  const emails = new CapturingEmailProvider();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: loadEnv,
      }),
      AppThrottlerModule,
      CommonModule,
      PrismaModule,
      EmailModule,
      AuthModule,
      OrganizationModule,
      AdminModule,
      TimelineModule,
      ClientsModule,
      ClientAccountsModule,
      ClientAssignmentsModule,
      ClientProfilesModule,
      ClientGoalsModule,
      ClientTagsModule,
      ClientMeasurementsModule,
      AssessmentsModule,
      AppointmentsModule,
      PracticeModule,
      FoodsModule,
      FoodOverridesModule,
      RecipesModule,
      MealPlansModule,
      TrackingModule,
      MessagingModule,
      DocumentsModule,
      InvoicesModule,
      TasksModule,
      AnalyticsModule,
      AiModule,
      AutomationModule,
      StorageModule,
    ],
  })
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(emails)
    .compile();

  const app = moduleRef.createNestApplication();
  configureHttpApp(app, loadEnv());
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    emails,
    tokens: app.get(TokenService),
    passwords: app.get(PasswordService),
    invitations: app.get(InvitationService),
    verification: app.get(EmailVerificationService),
    lifecycle: app.get(OrganizationLifecycleService),
    memberships: app.get(MembershipService),
    entitlements: app.get(EntitlementService),
    security: app.get(SecurityEventLogger),
  };
}

export async function resetAuthDatabase(prisma: PrismaService): Promise<void> {
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
  await prisma.organizationMember.deleteMany();
  await prisma.organizationSettings.deleteMany();
  await prisma.organization.deleteMany();
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
  await seedEntitlementCatalog(prisma);
  await seedPlatformAssessmentTemplate(prisma);
}

export function extractEmailedToken(text: string): string {
  const match = /Token: (\S+)/.exec(text);
  if (!match?.[1]) {
    throw new Error("Email did not contain a token");
  }
  return match[1];
}

export function cookieHeader(
  setCookie: string | string[] | undefined,
  name = "ns_session",
): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return headers.find((header) => header.startsWith(`${name}=`));
}

export function cookieValue(
  setCookie: string | string[] | undefined,
  name = "ns_session",
): string {
  const header = cookieHeader(setCookie, name);
  if (!header) {
    throw new Error(`Missing ${name} cookie`);
  }
  const value = header.split(";")[0]?.split("=")[1];
  if (!value) {
    throw new Error(`Empty ${name} cookie`);
  }
  return value;
}
