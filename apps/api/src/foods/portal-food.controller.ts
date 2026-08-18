import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
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
  @ApiOperation({ summary: "Search foods for client food logging (organization effective values)" })
  async search(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: ListFoodsQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.foods.search(client.organizationId, query);
  }
}
