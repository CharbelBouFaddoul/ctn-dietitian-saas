import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { CalculateFoodDto, ListFoodsQueryDto } from "./dto/food.dto";
import { FoodService } from "./food.service";

@ApiTags("foods")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/foods")
export class FoodController {
  constructor(private readonly foods: FoodService) {}

  @Get()
  @ApiOperation({ summary: "Search global foods (server-side pagination and filters)" })
  search(@CurrentTenant() tenant: TenantContext, @Query() query: ListFoodsQueryDto) {
    return this.foods.search(tenant.organizationId, query);
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
  getEffective(@CurrentTenant() tenant: TenantContext, @Param("foodId", ParseUUIDPipe) foodId: string) {
    return this.foods.getEffective(tenant.organizationId, foodId);
  }

  @Post(":foodId/calculate")
  @HttpCode(200)
  @ApiOperation({ summary: "Calculate nutrition for a quantity using effective values and the shared engine" })
  calculate(
    @CurrentTenant() tenant: TenantContext,
    @Param("foodId", ParseUUIDPipe) foodId: string,
    @Body() body: CalculateFoodDto,
  ) {
    return this.foods.calculate(tenant.organizationId, foodId, body.quantity, body.unit);
  }
}
