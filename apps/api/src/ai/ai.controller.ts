import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { AiService } from "./ai.service";

class AiPromptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  foodQuery?: string;
}

@ApiTags("ai")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class OrganizationAiController {
  constructor(private readonly ai: AiService) {}

  @Get("ai/usage")
  usage(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.ai.getUsageSummary(tenant.dietitianAccountId);
  }
}

@ApiTags("ai")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard, ThrottlerGuard)
@Throttle({ [THROTTLE_NAMES.AI]: {} })
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/ai")
export class ClientAiController {
  constructor(private readonly ai: AiService) {}

  @Post("client-summary")
  clientSummary(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateClientSummary(tenant, clientId, body.prompt);
  }

  @Post("meal-plan-assistance")
  mealPlanAssistance(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateMealPlanAssistance(tenant, clientId, body.prompt);
  }

  @Post("nutrition-assistance")
  nutritionAssistance(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateNutritionAssistance(tenant, clientId, body.foodQuery, body.prompt);
  }

  @Post("consultation-summary")
  consultationSummary(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateConsultationSummary(tenant, clientId, body.prompt);
  }

  @Post("message-draft")
  messageDraft(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateMessageDraft(tenant, clientId, body.prompt);
  }
}
