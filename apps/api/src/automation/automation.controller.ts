import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import type { AutomationActionType, AutomationTriggerType } from "@prisma/client";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { AutomationService } from "./automation.service";

class CreateAutomationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsEnum([
    "APPOINTMENT_UPCOMING",
    "APPOINTMENT_MISSED",
    "CLIENT_INACTIVE",
    "MEAL_PLAN_ENDING",
    "INVOICE_OVERDUE",
    "TASK_DUE",
    "CLIENT_CHECKIN_DUE",
    "SCHEDULED_DATE_TIME",
  ])
  triggerType!: AutomationTriggerType;

  @ApiProperty()
  @IsEnum([
    "SEND_IN_APP_NOTIFICATION",
    "SEND_EMAIL",
    "CREATE_TASK",
    "CREATE_CLIENT_NOTIFICATION",
  ])
  actionType!: AutomationActionType;

  @ApiProperty()
  @IsObject()
  configuration!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;
}

class UpdateAutomationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum([
    "APPOINTMENT_UPCOMING",
    "APPOINTMENT_MISSED",
    "CLIENT_INACTIVE",
    "MEAL_PLAN_ENDING",
    "INVOICE_OVERDUE",
    "TASK_DUE",
    "CLIENT_CHECKIN_DUE",
    "SCHEDULED_DATE_TIME",
  ])
  triggerType?: AutomationTriggerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum([
    "SEND_IN_APP_NOTIFICATION",
    "SEND_EMAIL",
    "CREATE_TASK",
    "CREATE_CLIENT_NOTIFICATION",
  ])
  actionType?: AutomationActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null;
}

@ApiTags("automations")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/automations")
export class AutomationsController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.automation.list(tenant);
  }

  @Get("usage/summary")
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.automation.getUsage(tenant);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateAutomationDto) {
    return this.automation.create(tenant, body);
  }

  @Get(":automationId")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("automationId", ParseUUIDPipe) automationId: string,
  ) {
    return this.automation.get(tenant, automationId);
  }

  @Patch(":automationId")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("automationId", ParseUUIDPipe) automationId: string,
    @Body() body: UpdateAutomationDto,
  ) {
    return this.automation.update(tenant, automationId, body);
  }

  @Post(":automationId/activate")
  activate(
    @CurrentTenant() tenant: TenantContext,
    @Param("automationId", ParseUUIDPipe) automationId: string,
  ) {
    return this.automation.activate(tenant, automationId);
  }

  @Post(":automationId/pause")
  pause(
    @CurrentTenant() tenant: TenantContext,
    @Param("automationId", ParseUUIDPipe) automationId: string,
  ) {
    return this.automation.pause(tenant, automationId);
  }

  @Post(":automationId/archive")
  archive(
    @CurrentTenant() tenant: TenantContext,
    @Param("automationId", ParseUUIDPipe) automationId: string,
  ) {
    return this.automation.archive(tenant, automationId);
  }

  @Get(":automationId/runs")
  listRuleRuns(
    @CurrentTenant() tenant: TenantContext,
    @Param("automationId", ParseUUIDPipe) automationId: string,
    @Query("limit") limit?: string,
  ) {
    return this.automation.listRunsForRule(tenant, automationId, limit ? Number(limit) : 50);
  }
}

@ApiTags("automations")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/automation-runs")
export class AutomationRunsController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query("limit") limit?: string) {
    return this.automation.listRuns(tenant, limit ? Number(limit) : 50);
  }
}
