import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import { FoodService } from "./food.service";

@ApiTags("foods")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/food-sources")
export class FoodSourceController {
  constructor(private readonly foods: FoodService) {}

  @Get()
  @ApiOperation({ summary: "List active food datasets/sources" })
  list() {
    return this.foods.listSources();
  }
}
