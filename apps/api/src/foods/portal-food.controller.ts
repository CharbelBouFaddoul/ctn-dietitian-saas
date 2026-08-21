import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { ListFoodsQueryDto } from "./dto/food.dto";
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
}
