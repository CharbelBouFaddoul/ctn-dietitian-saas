import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TrackingModule } from "../tracking/tracking.module";
import { AI_PROVIDER } from "./ai.provider";
import { AiContextService } from "./ai-context.service";
import { AiUsageService } from "./ai-usage.service";
import { AiService } from "./ai.service";
import { ClientAiController, OrganizationAiController } from "./ai.controller";
import { MockAiProvider } from "./mock-ai.provider";
import { OpenAiProvider } from "./openai-ai.provider";

@Module({
  imports: [AuthModule, DietitianModule, ClientsModule, EntitlementsModule, TrackingModule],
  controllers: [OrganizationAiController, ClientAiController],
  providers: [
    MockAiProvider,
    OpenAiProvider,
    {
      provide: AI_PROVIDER,
      useFactory: (config: ConfigService<AppEnv, true>, mock: MockAiProvider, openai: OpenAiProvider) => {
        return config.get("AI_PROVIDER", { infer: true }) === "openai" ? openai : mock;
      },
      inject: [ConfigService, MockAiProvider, OpenAiProvider],
    },
    AiUsageService,
    AiContextService,
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
