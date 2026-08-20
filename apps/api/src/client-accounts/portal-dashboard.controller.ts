import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { PortalDashboardService } from "./portal-dashboard.service";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal")
export class PortalDashboardController {
  constructor(private readonly dashboard: PortalDashboardService) {}

  @Get("dashboard")
  @ApiOperation({ summary: "Patient home dashboard aggregate for the active connection" })
  get(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.dashboard.get(user.id, session.activeClientId);
  }
}
