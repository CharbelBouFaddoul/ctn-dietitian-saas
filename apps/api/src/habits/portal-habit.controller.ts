import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { HabitCatalogService } from "./habit-catalog.service";

class PortalHabitQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;
}

class PortalHabitLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty()
  @IsBoolean()
  completed!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/habits")
export class PortalHabitController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly habits: HabitCatalogService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: PortalHabitQueryDto,
  ) {
    return this.withClient(user, session, (client) => this.habits.portalList(client, query.date));
  }

  @Put(":habitDefinitionId/log")
  upsertLog(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("habitDefinitionId", ParseUUIDPipe) habitDefinitionId: string,
    @Body() body: PortalHabitLogDto,
  ) {
    return this.withClient(user, session, (client) =>
      this.habits.portalUpsertLog(client, user.id, habitDefinitionId, body),
    );
  }

  private async withClient<T>(
    user: AuthenticatedRequestUser,
    session: AuthenticatedSession,
    fn: (client: Awaited<ReturnType<ClientAccessService["assertPortalAccess"]>>) => Promise<T>,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return fn(client);
  }
}
