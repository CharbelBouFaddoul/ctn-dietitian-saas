import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { adminActor } from "./admin-actor";
import { AdminUserService } from "./admin-user.service";
import { AdminUsersListQueryDto, UpdateAdminUserProfileDto, UpdatePlatformRoleDto, UpdateUserStatusDto } from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/users")
export class AdminUsersController {
  constructor(private readonly users: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: "List users" })
  list(@Query() query: AdminUsersListQueryDto) {
    return this.users.list(query);
  }

  @Get(":userId")
  @ApiOperation({ summary: "Get user and dietitian account ownership (read-only)" })
  get(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.get(userId);
  }

  @Patch(":userId/status")
  @ApiOperation({ summary: "Activate, suspend, or archive a user" })
  setStatus(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.users.setStatus(userId, body.status, adminActor(user, req));
  }

  @Patch(":userId")
  @ApiOperation({ summary: "Update user profile (name, email, password)" })
  updateProfile(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: UpdateAdminUserProfileDto,
  ) {
    return this.users.updateProfile(userId, body, adminActor(user, req));
  }

  @Patch(":userId/platform-role")
  @ApiOperation({ summary: "Grant or remove platform admin access" })
  setPlatformRole(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: UpdatePlatformRoleDto,
  ) {
    return this.users.setPlatformRole(userId, body.platformRole ?? null, adminActor(user, req));
  }
}
