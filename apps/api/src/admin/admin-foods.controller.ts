import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { ListFoodsQueryDto } from "../foods/dto/food.dto";
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

  @Get("foods")
  @ApiOperation({ summary: "Browse global catalog foods (read-only; no practice customs)" })
  listFoods(@Query() query: ListFoodsQueryDto) {
    return this.foods.adminSearchCatalog(query);
  }

  @Post("import")
  @ApiOperation({
    summary: "Replace the USDA Foundation catalog from the cached April 2026 dump",
  })
  importCurated() {
    return this.foods.adminImportCuratedDataset();
  }
}
