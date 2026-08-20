import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientGoalService } from "./client-goal.service";

class CreateGoalDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

@ApiTags("client-goals")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/goals")
export class ClientGoalController {
  constructor(private readonly goals: ClientGoalService) {}

  @Get()
  list(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.goals.list(tenant, clientId);
  }

  @Post()
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateGoalDto,
  ) {
    return this.goals.create(tenant, clientId, body);
  }

  @Post(":goalId/complete")
  @ClientActionRequired("manageRecords")
  complete(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("goalId", ParseUUIDPipe) goalId: string,
  ) {
    return this.goals.complete(tenant, clientId, goalId);
  }

  @Post(":goalId/cancel")
  @ClientActionRequired("manageRecords")
  cancel(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("goalId", ParseUUIDPipe) goalId: string,
  ) {
    return this.goals.cancel(tenant, clientId, goalId);
  }
}
