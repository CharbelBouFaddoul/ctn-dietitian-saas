import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import { FoodService } from "./food.service";

@ApiTags("foods")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/food-sources")
export class FoodSourceController {
  constructor(private readonly foods: FoodService) {}

  @Get()
  @ApiOperation({ summary: "List active food datasets/sources" })
  list() {
    return this.foods.listSources();
  }
}
