import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { adminActor } from "./admin-actor";
import { AdminPatientService } from "./admin-patient.service";
import { ProvisionPatientDto } from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/patients")
export class AdminPatientsController {
  constructor(private readonly patients: AdminPatientService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Provision a patient under a dietitian practice",
    description:
      "Creates Client + Profile (+ optional HEIGHT/WEIGHT measurements). With email, inviteToPortal defaults to true and creates User + ClientAccount + CLIENT_INVITE.",
  })
  provision(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Body() body: ProvisionPatientDto,
  ) {
    return this.patients.provision(body, adminActor(user, req));
  }
}
