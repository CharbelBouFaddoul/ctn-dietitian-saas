import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { HabitCatalogService } from "./habit-catalog.service";

class AssignHabitDto {
  @ApiProperty()
  @IsUUID()
  habitDefinitionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetUnit?: string;
}

@ApiTags("client-habits")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/habits")
export class ClientHabitAssignmentController {
  constructor(private readonly habits: HabitCatalogService) {}

  @Get()
  list(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
  ) {
    return this.habits.listClientAssignments(tenant, clientId);
  }

  @Post()
  @ClientActionRequired("manageRecords")
  assign(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AssignHabitDto,
  ) {
    return this.habits.assignToClient(tenant, clientId, body);
  }

  @Delete(":habitId")
  @ClientActionRequired("manageRecords")
  unassign(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("habitId", ParseUUIDPipe) habitId: string,
  ) {
    return this.habits.unassignFromClient(tenant, clientId, habitId);
  }
}
