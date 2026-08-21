import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { ApiCookieAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccountService } from "../client-accounts/client-account.service";
import { JoinCodeDto } from "./dto/join-code.dto";
import { DisconnectRequestDto } from "./dto/disconnect-request.dto";
import { UpdatePortalMeDto } from "./dto/update-portal-me.dto";

class SetActiveConnectionDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal")
export class PortalController {
  constructor(private readonly accounts: ClientAccountService) {}

  @Get("me")
  me(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.accounts.portalMe(user.id, session.activeClientId);
  }

  @Patch("me")
  updateMe(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: UpdatePortalMeDto,
  ) {
    return this.accounts.updatePortalMe(user.id, session.activeClientId, body);
  }

  @Get("onboarding")
  onboarding(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.accounts.onboarding(user.id);
  }

  @Get("connections")
  connections(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.accounts.listConnections(user.id);
  }

  @Post("connections/active")
  @HttpCode(HttpStatus.OK)
  setActiveConnection(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: SetActiveConnectionDto,
  ) {
    return this.accounts.setActiveConnection(user.id, session.id, body.clientId);
  }

  @Post("connections/disconnect-request")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.AUTH]: {} })
  requestDisconnect(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: DisconnectRequestDto,
  ) {
    return this.accounts.requestDisconnect(user.id, session.activeClientId, body);
  }

  @Delete("connections/disconnect-request")
  @HttpCode(HttpStatus.OK)
  cancelDisconnectRequest(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: DisconnectRequestDto,
  ) {
    return this.accounts.cancelDisconnectRequest(user.id, session.activeClientId, body.clientId);
  }

  @Post("join-code/resolve")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.AUTH]: {} })
  resolveJoinCode(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: JoinCodeDto) {
    return this.accounts.resolveJoinCode(user.id, body);
  }

  @Post("join")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.AUTH]: {} })
  async join(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: JoinCodeDto,
  ) {
    const result = await this.accounts.join(user.id, body);
    if (
      (result.status === "joined" || result.status === "already_connected") &&
      result.clientId &&
      !session.activeClientId
    ) {
      await this.accounts.setActiveConnection(user.id, session.id, result.clientId);
    }
    return result;
  }
}
