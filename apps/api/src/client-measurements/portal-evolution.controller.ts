import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { ClientMeasurementService } from "./client-measurement.service";

class EvolutionQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/evolution")
export class PortalEvolutionController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly measurements: ClientMeasurementService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Measurement evolution for the active portal client" })
  async get(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: EvolutionQueryDto,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    return this.measurements.evolutionScoped(client.dietitianAccountId, client.id, {
      from: query.from,
      to: query.to,
    });
  }
}
