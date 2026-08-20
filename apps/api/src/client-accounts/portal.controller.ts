import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { ClientAccountService } from "../client-accounts/client-account.service";
import { JoinCodeDto } from "./dto/join-code.dto";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal")
export class PortalController {
  constructor(private readonly accounts: ClientAccountService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.accounts.portalMe(user.id);
  }

  @Get("onboarding")
  onboarding(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.accounts.onboarding(user.id);
  }

  @Post("join")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ [THROTTLE_NAMES.AUTH]: {} })
  join(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: JoinCodeDto) {
    return this.accounts.join(user.id, body);
  }
}
