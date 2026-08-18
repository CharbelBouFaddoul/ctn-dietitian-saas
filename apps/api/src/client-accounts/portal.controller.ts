import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { ClientAccountService } from "../client-accounts/client-account.service";

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
}
