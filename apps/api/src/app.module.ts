import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { AppThrottlerModule } from "./common/app-throttler.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { EmailModule } from "./email/email.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { HealthModule } from "./health/health.module";
import { PlatformSettingsModule } from "./platform-settings/platform-settings.module";
import { OrganizationModule } from "./organizations/organization.module";
import { TimelineModule } from "./timeline/timeline.module";
import { ClientsModule } from "./clients/clients.module";
import { ClientAccountsModule } from "./client-accounts/client-accounts.module";
import { ClientAssignmentsModule } from "./client-assignments/client-assignments.module";
import { ClientProfilesModule } from "./client-profiles/client-profiles.module";
import { ClientGoalsModule } from "./client-goals/client-goals.module";
import { ClientTagsModule } from "./client-tags/client-tags.module";
import { ClientMeasurementsModule } from "./client-measurements/client-measurements.module";
import { AssessmentsModule } from "./assessments/assessments.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { PracticeModule } from "./practice/practice.module";
import { FoodsModule } from "./foods/foods.module";
import { FoodOverridesModule } from "./food-overrides/food-overrides.module";
import { RecipesModule } from "./recipes/recipes.module";
import { MealPlansModule } from "./meal-plans/meal-plans.module";
import { TrackingModule } from "./tracking/tracking.module";
import { MessagingModule } from "./messaging/messaging.module";
import { DocumentsModule } from "./documents/documents.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { TasksModule } from "./tasks/tasks.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AiModule } from "./ai/ai.module";
import { AutomationModule } from "./automation/automation.module";
import { DietitianAccountsModule } from "./dietitian-accounts/dietitian-accounts.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";
import { loadEnv } from "./config/env";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "../../.env")],
      validate: loadEnv,
    }),
    AppThrottlerModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    EmailModule,
    AuthModule,
    EntitlementsModule,
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
    DietitianAccountsModule,
    PlatformSettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
