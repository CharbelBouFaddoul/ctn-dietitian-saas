import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
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
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId")
export class OrganizationAiController {
  constructor(private readonly ai: AiService) {}

  @Get("ai/usage")
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.ai.getUsageSummary(tenant.organizationId);
  }
}

@ApiTags("ai")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard, ClientAccessGuard, ThrottlerGuard)
@Throttle({ [THROTTLE_NAMES.AI]: {} })
@Controller("api/v1/organizations/:organizationId/clients/:clientId/ai")
export class ClientAiController {
  constructor(private readonly ai: AiService) {}

  @Post("client-summary")
  clientSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateClientSummary(tenant, clientId, body.prompt);
  }

  @Post("meal-plan-assistance")
  mealPlanAssistance(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateMealPlanAssistance(tenant, clientId, body.prompt);
  }

  @Post("nutrition-assistance")
  nutritionAssistance(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateNutritionAssistance(tenant, clientId, body.foodQuery, body.prompt);
  }

  @Post("consultation-summary")
  consultationSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateConsultationSummary(tenant, clientId, body.prompt);
  }

  @Post("message-draft")
  messageDraft(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AiPromptDto,
  ) {
    return this.ai.generateMessageDraft(tenant, clientId, body.prompt);
  }
}
