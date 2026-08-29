import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { estimateAiCostMicros, FEATURE_KEYS, microsToUsd } from "@nutrition-saas/config";
import { Prisma, type AiAction, type AiRequestStatus } from "@prisma/client";
import type { AppEnv } from "@nutrition-saas/validation";
import type { z } from "@nutrition-saas/validation";
import { randomUUID } from "node:crypto";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { EntitlementService } from "../entitlements/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
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
import { AiUsageService, roundUsd } from "./ai-usage.service";

const DRAFT_KEEP = 50;

export interface AiGenerationResult<T> {
  requestId: string;
  draftId: string;
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
    tokens?: { used: number; limit: number | null; remaining: number | null };
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

  async getUsageSummary(dietitianAccountId: string, period?: string) {
    const currentKey = await this.usage.currentPeriodKey(dietitianAccountId);
    const periodKey = this.usage.resolvePeriodKey(period, currentKey);
    const [enabled, requestLimit, tokenLimit, usage, settings, breakdown] = await Promise.all([
      this.entitlements.can(dietitianAccountId, FEATURE_KEYS.AI),
      this.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AI_REQUEST_LIMIT),
      this.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AI_TOKEN_LIMIT),
      this.usage.getUsage(dietitianAccountId, periodKey),
      this.prisma.dietitianSettings.findUnique({ where: { dietitianAccountId } }),
      this.usage.requestBreakdown(dietitianAccountId, periodKey, "UTC"),
    ]);
    const timezone = settings?.timezone ?? "UTC";
    const detail = timezone === "UTC" ? breakdown : await this.usage.requestBreakdown(dietitianAccountId, periodKey, timezone);
    const used = usage.requestCount;
    const remaining = requestLimit === null ? null : Math.max(0, requestLimit - used);
    const tokenRemaining = tokenLimit === null ? null : Math.max(0, tokenLimit - usage.tokenCount);
    return {
      enabled,
      available: enabled && this.isRuntimeEnabled(),
      limit: requestLimit,
      used,
      remaining,
      periodKey,
      previousPeriodKey: this.usage.previousPeriodKey(periodKey),
      currentPeriodKey: currentKey,
      providerConfigured: this.isRuntimeEnabled(),
      requests: { used, limit: requestLimit, remaining },
      tokens: {
        used: usage.tokenCount,
        limit: tokenLimit,
        remaining: tokenRemaining,
        input: detail.input,
        output: detail.output,
      },
      costUsd: detail.costUsd || roundUsd(microsToUsd(usage.costMicros)),
      byDay: detail.byDay,
      byAction: detail.byAction,
      recent: detail.recent,
    };
  }

  async listPlatformUsage(query: { period?: string; q?: string; page?: number; pageSize?: number }) {
    const periodKey = this.usage.resolvePeriodKey(query.period, monthKeyUtc(new Date()));
    const listed = await this.usage.platformUsage({
      periodKey,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
    const items = await Promise.all(
      listed.items.map(async (row) => {
        const [requestLimit, tokenLimit] = await Promise.all([
          this.entitlements.limit(row.dietitianAccountId, FEATURE_KEYS.AI_REQUEST_LIMIT),
          this.entitlements.limit(row.dietitianAccountId, FEATURE_KEYS.AI_TOKEN_LIMIT),
        ]);
        return {
          ...row,
          requestLimit,
          tokenLimit,
          requestPct: pct(row.requests, requestLimit),
          tokenPct: pct(row.tokens, tokenLimit),
        };
      }),
    );
    return {
      ...listed,
      items,
    };
  }

  async generateClientSummary(tenant: DietitianTenantContext, clientId: string, userInput?: string, draftId?: string) {
    const context = await this.context.buildSummaryContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "CLIENT_SUMMARY",
      context,
      userInput,
      draftId,
      schema: clientSummaryOutputSchema,
    });
  }

  async generateMealPlanAssistance(tenant: DietitianTenantContext, clientId: string, userInput?: string, draftId?: string) {
    const context = await this.context.buildMealPlanContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "MEAL_PLAN_ASSISTANCE",
      context,
      userInput,
      draftId,
      schema: mealPlanAssistanceOutputSchema,
    });
  }

  async generateNutritionAssistance(
    tenant: DietitianTenantContext,
    clientId: string,
    foodQuery?: string,
    userInput?: string,
    draftId?: string,
  ) {
    const context = await this.context.buildNutritionContext(tenant, clientId, foodQuery);
    return this.generate({
      tenant,
      clientId,
      action: "NUTRITION_ASSISTANCE",
      context,
      userInput,
      foodQuery,
      draftId,
      schema: nutritionAssistanceOutputSchema,
    });
  }

  async generateConsultationSummary(tenant: DietitianTenantContext, clientId: string, userInput?: string, draftId?: string) {
    const context = await this.context.buildSummaryContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "CONSULTATION_SUMMARY",
      context,
      userInput,
      draftId,
      schema: consultationSummaryOutputSchema,
    });
  }

  async generateMessageDraft(tenant: DietitianTenantContext, clientId: string, userInput?: string, draftId?: string) {
    const context = await this.context.buildMessageContext(tenant, clientId);
    return this.generate({
      tenant,
      clientId,
      action: "MESSAGE_DRAFT",
      context,
      userInput,
      draftId,
      schema: messageDraftOutputSchema,
    });
  }

  async listDrafts(dietitianAccountId: string) {
    const rows = await this.prisma.aiDraft.findMany({
      where: { dietitianAccountId },
      orderBy: { createdAt: "desc" },
      take: DRAFT_KEEP,
      include: { client: { select: { firstName: true, lastName: true, displayName: true } } },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
        action: row.action,
        userInput: row.userInput,
        foodQuery: row.foodQuery,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getDraft(dietitianAccountId: string, draftId: string) {
    const row = await this.prisma.aiDraft.findFirst({
      where: { id: draftId, dietitianAccountId },
      include: { client: { select: { firstName: true, lastName: true, displayName: true } } },
    });
    if (!row) throw new NotFoundException("AI draft not found");
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`,
      action: row.action,
      userInput: row.userInput,
      foodQuery: row.foodQuery,
      result: row.output,
      messages: draftTurns(row),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteDraft(dietitianAccountId: string, draftId: string) {
    const row = await this.prisma.aiDraft.findFirst({
      where: { id: draftId, dietitianAccountId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("AI draft not found");
    await this.prisma.aiDraft.delete({ where: { id: row.id } });
    return { id: row.id, deleted: true };
  }

  private async generate<T>(input: {
    tenant: DietitianTenantContext;
    clientId: string;
    action: AiAction;
    context: unknown;
    userInput?: string;
    foodQuery?: string;
    draftId?: string;
    schema: z.ZodSchema<T>;
  }): Promise<AiGenerationResult<T>> {
    const dietitianAccountId = input.tenant.dietitianAccountId;
    const promptVersion = AI_PROMPT_VERSIONS[input.action];
    const correlationId = randomUUID();

    if (!this.isRuntimeEnabled()) {
      throw new ServiceUnavailableException("AI is not enabled in this environment");
    }

    const aiEnabled = await this.entitlements.can(dietitianAccountId, FEATURE_KEYS.AI);
    if (!aiEnabled) {
      await this.recordRejected({
        dietitianAccountId,
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
        dietitianAccountId,
        targetType: "client",
        targetId: input.clientId,
        reason: "entitlement_denied",
      });
      throw new ForbiddenException("AI is not enabled for this organization");
    }

    const limit = await this.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AI_REQUEST_LIMIT);
    if (limit === null || limit <= 0) {
      await this.recordRejected({
        dietitianAccountId,
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion,
        correlationId,
        errorCategory: "limit_unavailable",
      });
      throw new ForbiddenException("AI request limit is not available");
    }

    const reservation = await this.usage.reserveRequest(dietitianAccountId, limit);
    if (!reservation.allowed) {
      await this.recordRejected({
        dietitianAccountId,
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
        dietitianAccountId,
        targetType: "client",
        targetId: input.clientId,
        reason: "limit_exceeded",
      });
      throw new HttpException("AI request limit reached for this period", HttpStatus.TOO_MANY_REQUESTS);
    }

    const tokenLimit = await this.entitlements.limit(dietitianAccountId, FEATURE_KEYS.AI_TOKEN_LIMIT);
    if (tokenLimit !== null && reservation.tokenCount >= tokenLimit) {
      await this.usage.refundRequest(dietitianAccountId, reservation.periodKey);
      await this.recordRejected({
        dietitianAccountId,
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        promptVersion,
        correlationId,
        errorCategory: "token_limit_exceeded",
      });
      await this.security.record({
        type: "ai_request_denied",
        outcome: "failure",
        userId: input.tenant.userId,
        dietitianAccountId,
        targetType: "client",
        targetId: input.clientId,
        reason: "token_limit_exceeded",
      });
      throw new HttpException("AI token budget reached for this period", HttpStatus.TOO_MANY_REQUESTS);
    }

    const request = await this.prisma.aiRequest.create({
      data: {
        dietitianAccountId,
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
      const costMicros = estimateAiCostMicros(completion.model, completion.inputTokens, completion.outputTokens);
      await this.prisma.aiRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          provider: completion.provider,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          costMicros: BigInt(costMicros),
          latencyMs,
          completedAt: new Date(),
        },
      });
      await this.usage.recordCompletion(dietitianAccountId, reservation.periodKey, {
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        costMicros,
      });
      const tokenUsed = reservation.tokenCount + completion.inputTokens + completion.outputTokens;
      const draft = await this.persistDraft({
        dietitianAccountId,
        userId: input.tenant.userId,
        clientId: input.clientId,
        action: input.action,
        userInput: input.userInput,
        foodQuery: input.foodQuery,
        output: result,
        requestId: request.id,
        draftId: input.draftId,
      }).catch(() => null);
      return {
        requestId: request.id,
        draftId: draft?.id ?? "",
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
          tokens: {
            used: tokenUsed,
            limit: tokenLimit,
            remaining: tokenLimit === null ? null : Math.max(0, tokenLimit - tokenUsed),
          },
        },
      };
    } catch (error) {
      await this.usage.refundRequest(dietitianAccountId, reservation.periodKey);
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
          dietitianAccountId,
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
    dietitianAccountId: string;
    userId: string;
    clientId: string;
    action: AiAction;
    promptVersion: string;
    correlationId: string;
    errorCategory: string;
  }) {
    await this.prisma.aiRequest.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
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

  private async persistDraft(input: {
    dietitianAccountId: string;
    userId: string;
    clientId: string;
    action: AiAction;
    userInput?: string;
    foodQuery?: string;
    output: unknown;
    requestId: string;
    draftId?: string;
  }) {
    const turn: DraftTurn = {
      userInput: input.userInput?.trim() || null,
      foodQuery: input.foodQuery?.trim() || null,
      result: jsonObject(input.output),
      createdAt: new Date().toISOString(),
    };
    if (input.draftId) {
      const existing = await this.prisma.aiDraft.findFirst({
        where: {
          id: input.draftId,
          dietitianAccountId: input.dietitianAccountId,
          clientId: input.clientId,
          action: input.action,
        },
      });
      if (existing) {
        return this.prisma.aiDraft.update({
          where: { id: existing.id },
          data: {
            userInput: turn.userInput,
            foodQuery: turn.foodQuery,
            output: jsonObject(input.output),
            requestId: input.requestId,
            messages: jsonValue([...draftTurns(existing), turn]),
          },
        });
      }
    }
    const draft = await this.prisma.aiDraft.create({
      data: {
        dietitianAccountId: input.dietitianAccountId,
        userId: input.userId,
        clientId: input.clientId,
        action: input.action,
        userInput: turn.userInput,
        foodQuery: turn.foodQuery,
        output: jsonObject(input.output),
        messages: jsonValue([turn]),
        requestId: input.requestId,
      },
    });
    const extra = await this.prisma.aiDraft.findMany({
      where: { dietitianAccountId: input.dietitianAccountId },
      orderBy: { createdAt: "desc" },
      skip: DRAFT_KEEP,
      select: { id: true },
    });
    if (extra.length) {
      await this.prisma.aiDraft.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
    }
    return draft;
  }
}

type DraftTurn = {
  userInput: string | null;
  foodQuery: string | null;
  result: Prisma.InputJsonObject;
  createdAt: string;
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonObject;
}

function draftTurns(row: { userInput: string | null; foodQuery: string | null; output: unknown; messages: unknown; createdAt: Date }): DraftTurn[] {
  if (Array.isArray(row.messages)) {
    return row.messages.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const turn = item as Record<string, unknown>;
      return [
        {
          userInput: typeof turn.userInput === "string" ? turn.userInput : null,
          foodQuery: typeof turn.foodQuery === "string" ? turn.foodQuery : null,
          result: jsonObject(turn.result),
          createdAt: typeof turn.createdAt === "string" ? turn.createdAt : new Date().toISOString(),
        },
      ];
    });
  }
  return [
    {
      userInput: row.userInput,
      foodQuery: row.foodQuery,
      result: jsonObject(row.output),
      createdAt: row.createdAt.toISOString(),
    },
  ];
}

function pct(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.round((used / limit) * 1000) / 10;
}

function monthKeyUtc(instant: Date): string {
  return `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, "0")}`;
}
