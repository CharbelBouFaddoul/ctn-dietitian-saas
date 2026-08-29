import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { InvitationService } from "../src/auth/invitation.service";
import { PasswordService } from "../src/auth/password.service";
import { TokenService } from "../src/auth/token.service";
import { EmailVerificationService } from "../src/auth/email-verification.service";
import { SecurityEventLogger } from "../src/auth/security-event.logger";
import { AdminModule } from "../src/admin/admin.module";
import { EntitlementService } from "../src/entitlements/entitlement.service";
import { PlatformSettingsModule } from "../src/platform-settings/platform-settings.module";
import { DietitianModule } from "../src/dietitian/dietitian.module";
import { DietitianLifecycleService } from "../src/dietitian/dietitian-lifecycle.service";
import { TimelineModule } from "../src/timeline/timeline.module";
import { ClientsModule } from "../src/clients/clients.module";
import { ClientAccountsModule } from "../src/client-accounts/client-accounts.module";
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
import { HabitsModule } from "../src/habits/habits.module";
import { MessagingModule } from "../src/messaging/messaging.module";
import { RedisIoAdapter } from "../src/messaging/redis-io.adapter";
import { DocumentsModule } from "../src/documents/documents.module";
import { InvoicesModule } from "../src/invoices/invoices.module";
import { TasksModule } from "../src/tasks/tasks.module";
import { AnalyticsModule } from "../src/analytics/analytics.module";
import { AiModule } from "../src/ai/ai.module";
import { AutomationModule } from "../src/automation/automation.module";
import { DietitianAccountsModule } from "../src/dietitian-accounts/dietitian-accounts.module";
import { AppThrottlerModule } from "../src/common/app-throttler.module";
import { CommonModule } from "../src/common/common.module";
import { StorageModule } from "../src/storage/storage.module";
import { RedisModule } from "../src/redis/redis.module";
import { configureHttpApp } from "../src/app.setup";
import { loadEnv } from "../src/config/env";
import { EMAIL_PROVIDER } from "../src/email/email.provider";
import { EmailModule } from "../src/email/email.module";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { CapturingEmailProvider } from "./capturing-email.provider";
import { assertTestWipeAllowed } from "../src/demo/safety";
import { wipeApplicationData, seedPlatformBootstrap } from "../src/demo/wipe";

export interface AuthTestContext {
  app: INestApplication;
  prisma: PrismaService;
  emails: CapturingEmailProvider;
  tokens: TokenService;
  passwords: PasswordService;
  invitations: InvitationService;
  verification: EmailVerificationService;
  lifecycle: DietitianLifecycleService;
  entitlements: EntitlementService;
  security: SecurityEventLogger;
  port?: number;
  realtimeAdapter?: RedisIoAdapter;
}

export async function createAuthTestApp(options?: { realtime?: boolean }): Promise<AuthTestContext> {
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
      RedisModule,
      EmailModule,
      AuthModule,
      DietitianModule,
      AdminModule,
      TimelineModule,
      ClientsModule,
      ClientAccountsModule,
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
      HabitsModule,
      MessagingModule,
      DocumentsModule,
      InvoicesModule,
      TasksModule,
      AnalyticsModule,
      AiModule,
      AutomationModule,
      DietitianAccountsModule,
      PlatformSettingsModule,
      StorageModule,
    ],
  })
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(emails)
    .compile();

  const app = moduleRef.createNestApplication();
  configureHttpApp(app, loadEnv());

  let realtimeAdapter: RedisIoAdapter | undefined;
  let port: number | undefined;
  if (options?.realtime) {
    realtimeAdapter = new RedisIoAdapter(app, loadEnv());
    await realtimeAdapter.connectToRedis();
    app.useWebSocketAdapter(realtimeAdapter);
  }

  await app.init();

  if (options?.realtime) {
    await app.listen(0);
    const address = app.getHttpServer().address();
    port = typeof address === "object" && address ? address.port : undefined;
  }

  return {
    app,
    prisma: app.get(PrismaService),
    emails,
    tokens: app.get(TokenService),
    passwords: app.get(PasswordService),
    invitations: app.get(InvitationService),
    verification: app.get(EmailVerificationService),
    lifecycle: app.get(DietitianLifecycleService),
    entitlements: app.get(EntitlementService),
    security: app.get(SecurityEventLogger),
    port,
    realtimeAdapter,
  };
}

export async function resetAuthDatabase(prisma: PrismaService): Promise<void> {
  await assertTestWipeAllowed(prisma);
  await wipeApplicationData(prisma);
  await seedPlatformBootstrap(prisma, { registrationEnabled: true });
  // Demo/prod seed keeps AI catalog features inactive; automated tests re-enable them.
  await prisma.feature.updateMany({
    where: { key: { in: [FEATURE_KEYS.AI, FEATURE_KEYS.AI_REQUEST_LIMIT, FEATURE_KEYS.AI_TOKEN_LIMIT] } },
    data: { status: "ACTIVE" },
  });
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

export const TEST_PASSWORD = "ValidPass12";

export const DEFAULT_ORG_SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg",
  heightUnit: "cm",
  dateFormat: "YYYY_MM_DD",
} as const;

/** Phase 7: entitlements resolve by dietitianAccountId only. */
export async function activateSubscription(
  prisma: PrismaService,
  dietitianAccountId: string,
  planSlug = "standard",
) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: planSlug } });
  return prisma.subscription.create({
    data: {
      dietitianAccountId,
      planId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
}

export async function activateStandardSubscription(prisma: PrismaService, dietitianAccountId: string) {
  return activateSubscription(prisma, dietitianAccountId, "standard");
}

export async function createOrgWithSubscription(
  ctx: AuthTestContext,
  cookie: string,
  name: string,
  options?: { planSlug?: string; settings?: Record<string, unknown> },
): Promise<{ id: string; name: string }> {
  const created = await request(ctx.app.getHttpServer())
    .post("/api/v1/dietitian")
    .set("Cookie", cookie)
    .send({ name, settings: options?.settings ?? DEFAULT_ORG_SETTINGS })
    .expect(201);
  await activateSubscription(ctx.prisma, created.body.id, options?.planSlug ?? "standard");
  return created.body as { id: string; name: string };
}

export async function generateJoinCode(
  ctx: AuthTestContext,
  ownerCookie: string,
  dietitianAccountId: string,
  clientId: string,
): Promise<{ code: string; expiresAt: string; hint: string; status: string }> {
  const generated = await request(ctx.app.getHttpServer())
    .post(`/api/v1/dietitian/${dietitianAccountId}/clients/${clientId}/account/join-code`)
    .set("Cookie", ownerCookie)
    .expect(201);
  return generated.body as { code: string; expiresAt: string; hint: string; status: string };
}

export async function generatePracticeJoinCode(
  ctx: AuthTestContext,
  ownerCookie: string,
  dietitianAccountId: string,
): Promise<{ code: string; expiresAt: string; hint: string; status: string }> {
  const generated = await request(ctx.app.getHttpServer())
    .post(`/api/v1/dietitian/${dietitianAccountId}/join-code`)
    .set("Cookie", ownerCookie)
    .expect(201);
  return generated.body as { code: string; expiresAt: string; hint: string; status: string };
}

export async function registerVerifyLoginUser(
  ctx: AuthTestContext,
  address: string,
  password = TEST_PASSWORD,
  names?: { firstName: string; lastName: string },
): Promise<{ address: string; cookie: string }> {
  await request(ctx.app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ email: address, password, ...names })
    .expect(200);
  const token = extractEmailedToken(ctx.emails.last().text);
  await request(ctx.app.getHttpServer()).post("/api/v1/auth/verify-email").send({ token }).expect(200);
  const login = await request(ctx.app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: address, password })
    .expect(200);
  return { address, cookie: `ns_session=${cookieValue(login.headers["set-cookie"])}` };
}

export async function connectClientPortal(
  ctx: AuthTestContext,
  ownerCookie: string,
  dietitianAccountId: string,
  client: { id: string; email: string },
  password = TEST_PASSWORD,
): Promise<string> {
  const { code } = await generateJoinCode(ctx, ownerCookie, dietitianAccountId, client.id);
  const session = await registerVerifyLoginUser(ctx, client.email, password);
  await request(ctx.app.getHttpServer())
    .post("/api/v1/portal/join")
    .set("Cookie", session.cookie)
    .send({ code })
    .expect(201);
  return session.cookie;
}
