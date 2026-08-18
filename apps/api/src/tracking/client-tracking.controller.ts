import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { localDateKey } from "@nutrition-saas/utilities";
import { SessionGuard } from "../auth/guards/session.guard";
import { ClientAccessService } from "../clients/client-access.service";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { TrackingDateQueryDto } from "./dto/tracking.dto";
import { FoodLogService, TrackingTimezoneService } from "./food-log.service";
import { TrackingSummaryService } from "./tracking-summary.service";
import {
  ExerciseLogService,
  HabitLogService,
  SleepLogService,
  WaterLogService,
} from "./water-exercise-sleep-habit.service";

@ApiTags("client-tracking")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/clients/:clientId/tracking")
export class ClientTrackingController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly summary: TrackingSummaryService,
    private readonly timezone: TrackingTimezoneService,
    private readonly foodLogs: FoodLogService,
    private readonly waterLogs: WaterLogService,
    private readonly exerciseLogs: ExerciseLogService,
    private readonly sleepLogs: SleepLogService,
    private readonly habitLogs: HabitLogService,
  ) {}

  @Get("summary")
  @ApiOperation({ summary: "Daily tracking summary for a client (read-only)" })
  async getSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TrackingDateQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    const date = await this.resolveDate(client, query.date);
    return this.summary.dailySummary(client, date);
  }

  @Get("food-logs")
  async listFood(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TrackingDateQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.foodLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Get("water-logs")
  async listWater(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TrackingDateQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.waterLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Get("exercise-logs")
  async listExercise(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TrackingDateQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.exerciseLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Get("sleep")
  async getSleep(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TrackingDateQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.sleepLogs.getForClient(client, await this.resolveDate(client, query.date));
  }

  @Get("habits")
  async listHabits(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TrackingDateQueryDto,
  ) {
    const client = await this.access.assertCanAccess(tenant, clientId, "read");
    return this.habitLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  private async resolveDate(client: Awaited<ReturnType<ClientAccessService["assertCanAccess"]>>, date?: string) {
    if (date) {
      this.timezone.parseTrackingDate(date);
      return date;
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    return localDateKey(new Date(), timeZone);
  }
}
