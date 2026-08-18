import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { AdminAuditService } from "./admin-audit.service";
import { AdminSubscriptionService } from "./admin-subscription.service";
import { AdminAuditQueryDto } from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin")
export class AdminListsController {
  constructor(
    private readonly subscriptions: AdminSubscriptionService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get("subscriptions")
  @ApiOperation({ summary: "List organization subscriptions" })
  listSubscriptions() {
    return this.subscriptions.list();
  }

  @Get("audit")
  @ApiOperation({ summary: "List platform audit logs" })
  listAudit(@Query() query: AdminAuditQueryDto) {
    return this.audit.list(query);
  }
}
