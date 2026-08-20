import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PlatformSettingsService } from "./platform-settings.service";

@ApiTags("public")
@Controller("api/v1/public")
export class PublicSiteSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("site-settings")
  @ApiOperation({ summary: "Public marketing site settings (brand, nav, footer, contact)" })
  @ApiOkResponse()
  get() {
    return this.settings.getPublic();
  }
}
