import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { CalculateFoodDto, ListFoodsQueryDto } from "./dto/food.dto";
import { FoodService } from "./food.service";

@ApiTags("foods")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/foods")
export class FoodController {
  constructor(private readonly foods: FoodService) {}

  @Get()
  @ApiOperation({ summary: "Search global foods (server-side pagination and filters)" })
  search(@CurrentTenant() tenant: DietitianTenantContext, @Query() query: ListFoodsQueryDto) {
    return this.foods.search(tenant.dietitianAccountId, query);
  }

  @Get("categories")
  @ApiOperation({ summary: "List distinct food categories from the active catalog" })
  categories() {
    return this.foods.listCategories();
  }

  @Get(":foodId")
  @ApiOperation({
    summary: "Get effective food for this organization",
    description:
      "Returns global values, the organization override if any, and merged effective nutrition. Does not mutate global foods.",
  })
  getEffective(@CurrentTenant() tenant: DietitianTenantContext, @Param("foodId", ParseUUIDPipe) foodId: string) {
    return this.foods.getEffective(tenant.dietitianAccountId, foodId);
  }

  @Post(":foodId/calculate")
  @HttpCode(200)
  @ApiOperation({ summary: "Calculate nutrition for a quantity using effective values and the shared engine" })
  calculate(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("foodId", ParseUUIDPipe) foodId: string,
    @Body() body: CalculateFoodDto,
  ) {
    return this.foods.calculate(tenant.dietitianAccountId, foodId, body.quantity, body.unit);
  }
}
