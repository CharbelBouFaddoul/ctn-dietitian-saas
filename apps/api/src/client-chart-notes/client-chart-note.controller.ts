import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import type { ChartNoteKind } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientChartNoteService } from "./client-chart-note.service";

class CreateChartNoteDto {
  @ApiProperty({ enum: ["CLINICAL", "MEAL", "EATING_HABIT", "PREGNANCY"] })
  @IsEnum(["CLINICAL", "MEAL", "EATING_HABIT", "PREGNANCY"])
  kind!: ChartNoteKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mealSlot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  notedAt?: string;
}

@ApiTags("client-chart-notes")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/chart-notes")
export class ClientChartNoteController {
  constructor(private readonly notes: ClientChartNoteService) {}

  @Get()
  list(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query("kind") kind?: string,
  ) {
    return this.notes.list(tenant, clientId, kind);
  }

  @Post()
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateChartNoteDto,
  ) {
    return this.notes.create(tenant, clientId, body);
  }

  @Delete(":noteId")
  @ClientActionRequired("manageRecords")
  remove(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("noteId", ParseUUIDPipe) noteId: string,
  ) {
    return this.notes.remove(tenant, clientId, noteId);
  }
}
