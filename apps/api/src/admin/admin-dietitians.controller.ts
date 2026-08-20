import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { adminActor } from "./admin-actor";
import { AdminDietitianService } from "./admin-dietitian.service";
import { ProvisionDietitianDto } from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/dietitians")
export class AdminDietitiansController {
  constructor(private readonly dietitians: AdminDietitianService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Provision a dietitian account",
    description:
      "Creates a user, DietitianAccount + DietitianSettings, optional ACTIVE subscription, and sends a DIETITIAN_ACTIVATION invitation email.",
  })
  provision(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Body() body: ProvisionDietitianDto,
  ) {
    return this.dietitians.provision(body, adminActor(user, req));
  }
}
