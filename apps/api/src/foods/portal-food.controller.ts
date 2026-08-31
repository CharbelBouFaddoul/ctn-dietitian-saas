import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { CalculateFoodDto, ListFoodsQueryDto } from "./dto/food.dto";
import { FoodService } from "./food.service";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/foods")
export class PortalFoodController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly foods: FoodService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Browse and search catalog and practice foods for client food logging" })
  async search(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Query() query: ListFoodsQueryDto,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.foods.search(requireDietitianAccountId(client), {
      ...query,
      catalogOnly: false,
      origin: query.origin ?? "all",
    });
  }

  @Get("categories")
  @ApiOperation({ summary: "List food categories available for client food logging" })
  async categories(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.foods.listCategories(requireDietitianAccountId(client));
  }

  @Get("sources")
  @ApiOperation({ summary: "List catalog food sources available for client food logging" })
  async sources(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.foods.listSources();
  }

  @Get(":foodId")
  @ApiOperation({ summary: "Food details and nutrition facts for the active clinic connection" })
  async getOne(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("foodId", ParseUUIDPipe) foodId: string,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.foods.getEffective(requireDietitianAccountId(client), foodId);
  }

  @Post(":foodId/calculate")
  @HttpCode(200)
  @ApiOperation({ summary: "Calculate nutrition for a quantity of a clinic-visible food" })
  async calculate(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("foodId", ParseUUIDPipe) foodId: string,
    @Body() body: CalculateFoodDto,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.foods.calculate(requireDietitianAccountId(client), foodId, body.quantity, body.unit);
  }
}
