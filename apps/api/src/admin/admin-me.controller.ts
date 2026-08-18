import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin")
export class AdminMeController {
  @Get("me")
  @ApiOperation({ summary: "Current platform administrator" })
  @ApiOkResponse()
  @ApiForbiddenResponse()
  me(@CurrentUser() user: AuthenticatedRequestUser) {
    return {
      user: {
        id: user.id,
        email: user.email,
        platformRole: user.platformRole,
      },
    };
  }
}
