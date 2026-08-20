import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import type { AiAction, AiRequestStatus } from "@prisma/client";
import type { AppEnv } from "@nutrition-saas/validation";
import type { z } from "@nutrition-saas/validation";
import { randomUUID } from "node:crypto";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { EntitlementService } from "../entitlements/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../organizations/tenant.types";
import { AI_PROVIDER, type AiProvider } from "./ai.provider";
import { AiContextService } from "./ai-context.service";
import {
  clientSummaryOutputSchema,
  consultationSummaryOutputSchema,
  mealPlanAssistanceOutputSchema,
  messageDraftOutputSchema,
  nutritionAssistanceOutputSchema,
  parseAiJson,
} from "./ai-output.schemas";
import { AI_PROMPT_VERSIONS, buildSystemPrompt, buildUserPrompt } from "./ai-prompts";
import { AiUsageService } from "./ai-usage.service";
import { legacyOrganizationId } from "../organizations/tenant-scope";

export interface AiGenerationResult<T> {
  requestId: string;
  action: AiAction;
  promptVersion: string;
  provider: string;
  model: string;
  generatedAt: string;
  disclaimer: string;
  result: T;
  usage: {
    periodKey: string;
    used: number;
    limit: number | null;
    remaining: number | null;
  };
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: AiUsageService,
    private readonly context: AiContextService,
    private readonly security: SecurityEventLogger,
    private readonly config: ConfigService<AppEnv, true>,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async getUsageSummary(organizationId: string) {
    const [enabled, limit, usage] = await Promise.all([
      this.entitlements.can(organizationId, FEATURE_KEYS.AI),
      this.entitlements.limit(organizationId, FEATURE_KEYS.AI_REQUEST_LIMIT),
      this.usage.getUsage(organizationId),
    ]);
    const used = usage.requestCount;
    const remaining = limit === null ? null : Math.max(0, limit - used);
    return {
      enabled,
      limit,
      used,
      remaining,
      periodKey: usage.periodKey,
      providerConfigured: this.isRuntimeEnabled(),
    };
  }

  async generateClientSummary(tenant: TenantContext, clientId: string, userInput?: string) {
    const context = await this.context.buildClientContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "CLIENT_SUMMARY",
      context,
      userInput,
      schema: clientSummaryOutputSchema,
    });
  }

  async generateMealPlanAssistance(tenant: TenantContext, clientId: string, userInput?: string) {
    const context = await this.context.buildClientContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "MEAL_PLAN_ASSISTANCE",
      context,
      userInput,
      schema: mealPlanAssistanceOutputSchema,
    });
  }

  async generateNutritionAssistance(tenant: TenantContext, clientId: string, foodQuery?: string, userInput?: string) {
    const context = await this.context.buildNutritionContext(tenant, clientId, foodQuery);
    return this.generate({
      tenant,
      clientId,
      action: "NUTRITION_ASSISTANCE",
      context,
      userInput,
      schema: nutritionAssistanceOutputSchema,
    });
  }

  async generateConsultationSummary(tenant: TenantContext, clientId: string, userInput?: string) {
    const context = await this.context.buildClientContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "CONSULTATION_SUMMARY",
      context,
      userInput,
      schema: consultationSummaryOutputSchema,
    });
  }

  async generateMessageDraft(tenant: TenantContext, clientId: string, userInput?: string) {
    const context = await this.context.buildMessageContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "MESSAGE_DRAFT",
      context,
      userInput,
      schema: messageDraftOutputSchema,
    });
  }

  private async generate<T>(input: {
    tenant: TenantContext;
    clientId: string;
    action: AiAction;
    context: unknown;
    userInput?: string;
    schema: z.ZodSchema<T>;
  }): Promise<AiGenerationResult<T>> {
    const organizationId = input.tenant.organizationId;
    const promptVersion = AI_PROMPT_VERSIONS[input.action];
    const correlationId = randomUUID();

    if (!this.isRuntimeEnabled()) {
      throw new ServiceUnavailableException("AI is not enabled in this environment");
    }

    const aiEnabled = await this.entitlements.can(organizationId, FEATURE_KEYS.AI);
    if (!aiEnabled) {
      await this.recordRejected({
        organizationId,
        legacyOrganizationId: legacyOrganizationId(input.tenant),
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion,
        correlationId,
        errorCategory: "entitlement_denied",
      });
      await this.security.record({
        type: "ai_request_denied",
        outcome: "failure",
        userId: input.tenant.userId,
        organizationId,
        targetType: "client",
        targetId: input.clientId,
        reason: "entitlement_denied",
      });
      throw new ForbiddenException("AI is not enabled for this organization");
    }

    const limit = await this.entitlements.limit(organizationId, FEATURE_KEYS.AI_REQUEST_LIMIT);
    if (limit === null || limit <= 0) {
      await this.recordRejected({
        organizationId,
        legacyOrganizationId: legacyOrganizationId(input.tenant),
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion,
        correlationId,
        errorCategory: "limit_unavailable",
      });
      throw new ForbiddenException("AI request limit is not available");
    }

    const reservation = await this.usage.reserveRequest(organizationId, limit);
    if (!reservation.allowed) {
      await this.recordRejected({
        organizationId,
        legacyOrganizationId: legacyOrganizationId(input.tenant),
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion,
        correlationId,
        errorCategory: "limit_exceeded",
      });
      await this.security.record({
        type: "ai_request_denied",
        outcome: "failure",
        userId: input.tenant.userId,
        organizationId,
        targetType: "client",
        targetId: input.clientId,
        reason: "limit_exceeded",
      });
      throw new HttpException("AI request limit reached for this period", HttpStatus.TOO_MANY_REQUESTS);
    }

    const request = await this.prisma.aiRequest.create({
      data: {
        dietitianAccountId: organizationId,
        organizationId: legacyOrganizationId(input.tenant),
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion,
        provider: this.provider.name,
        model: this.config.get("AI_MODEL", { infer: true }),
        status: "PENDING",
        correlationId,
      },
    });

    const started = Date.now();
    try {
      const system = buildSystemPrompt(input.action);
      const user = buildUserPrompt(input.action, input.context, input.userInput);
      this.assertPromptSize(system, user);
      const completion = await this.provider.complete({
        system,
        user,
        maxOutputTokens: this.config.get("AI_MAX_OUTPUT_TOKENS", { infer: true }),
        responseFormat: "json",
      });
      const result = parseAiJson(input.schema, completion.content);
      const latencyMs = Date.now() - started;
      await this.prisma.aiRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          provider: completion.provider,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          latencyMs,
          completedAt: new Date(),
        },
      });
      return {
        requestId: request.id,
        action: input.action,
        promptVersion,
        provider: completion.provider,
        model: completion.model,
        generatedAt: new Date().toISOString(),
        disclaimer: "AI-generated assistance — review before use. Not a diagnosis or autonomous treatment decision.",
        result,
        usage: {
          periodKey: reservation.periodKey,
          used: reservation.used,
          limit,
          remaining: Math.max(0, limit - reservation.used),
        },
      };
    } catch (error) {
      const category = this.errorCategory(error);
      await this.prisma.aiRequest.update({
        where: { id: request.id },
        data: {
          status: category === "validation_failed" ? ("FAILED" as AiRequestStatus) : "FAILED",
          errorCategory: category,
          latencyMs: Date.now() - started,
          completedAt: new Date(),
        },
      });
      if (category === "validation_failed") {
        await this.security.record({
          type: "ai_generation_failed",
          outcome: "failure",
          userId: input.tenant.userId,
          organizationId,
          targetType: "ai_request",
          targetId: request.id,
          reason: category,
        });
        throw new BadRequestException("AI response validation failed");
      }
      if (error instanceof HttpException) throw error;
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("AI generation failed");
    }
  }

  private isRuntimeEnabled(): boolean {
    const flag = this.config.get("AI_ENABLED", { infer: true });
    if (flag === "false") return false;
    if (this.config.get("AI_PROVIDER", { infer: true }) === "mock") return true;
    return Boolean(this.config.get("AI_API_KEY", { infer: true }));
  }

  private assertPromptSize(system: string, user: string) {
    const maxInputTokens = this.config.get("AI_MAX_INPUT_TOKENS", { infer: true });
    const approxTokens = Math.ceil((system.length + user.length) / 4);
    if (approxTokens > maxInputTokens) {
      throw new BadRequestException("AI context is too large for the configured input limit");
    }
  }

  private async recordRejected(input: {
    organizationId: string;
    legacyOrganizationId?: string | null;
    userId: string;
    clientId: string;
    action: AiAction;
    promptVersion: string;
    correlationId: string;
    errorCategory: string;
  }) {
    await this.prisma.aiRequest.create({
      data: {
        dietitianAccountId: input.organizationId,
        organizationId: input.legacyOrganizationId ?? input.organizationId,
        userId: input.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion: input.promptVersion,
        provider: this.provider.name,
        status: "REJECTED",
        correlationId: input.correlationId,
        errorCategory: input.errorCategory,
        completedAt: new Date(),
      },
    });
  }

  private errorCategory(error: unknown): string {
    if (error instanceof BadRequestException) return "validation_failed";
    if (error instanceof ServiceUnavailableException) return "provider_unavailable";
    if (error instanceof SyntaxError) return "validation_failed";
    return "internal_error";
  }
}
