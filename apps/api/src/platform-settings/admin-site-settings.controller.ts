import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { PlatformRolesGuard } from "../admin/guards/platform-roles.guard";
import { UpdatePlatformSettingsDto } from "./dto/platform-settings.dto";
import { PlatformSettingsService } from "./platform-settings.service";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin")
export class AdminSiteSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("site-settings")
  @ApiOperation({ summary: "Get platform marketing site settings" })
  @ApiOkResponse()
  get() {
    return this.settings.getAdmin();
  }

  @Patch("site-settings")
  @ApiOperation({ summary: "Update platform marketing site settings" })
  @ApiOkResponse()
  patch(@Body() body: UpdatePlatformSettingsDto) {
    return this.settings.update(body);
  }
}
