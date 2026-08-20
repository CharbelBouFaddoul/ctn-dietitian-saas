import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccountService } from "../client-accounts/client-account.service";
import { JoinCodeDto } from "./dto/join-code.dto";

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
    if (result.status === "connected" && result.clientId && !session.activeClientId) {
      await this.accounts.setActiveConnection(user.id, session.id, result.clientId);
    }
    return result;
  }
}
