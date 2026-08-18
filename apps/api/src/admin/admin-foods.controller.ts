import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { FoodService } from "../foods/food.service";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/food-sources")
export class AdminFoodsController {
  constructor(private readonly foods: FoodService) {}

  @Get()
  @ApiOperation({ summary: "Read-only food dataset/source visibility (version, counts, last import report)" })
  list() {
    return this.foods.adminListSources();
  }
}
