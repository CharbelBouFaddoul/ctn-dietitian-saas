import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { MealPlanService } from "./meal-plan.service";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal")
export class PortalMealPlanController {
  constructor(private readonly plans: MealPlanService) {}

  @Get("meal-plan")
  @ApiOperation({ summary: "Current published meal plan for the signed-in client" })
  current(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    return this.plans.portalCurrent(user.id, session.activeClientId);
  }
}
