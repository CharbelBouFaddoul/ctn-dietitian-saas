import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { localDateKey } from "@nutrition-saas/utilities";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { FoodLogService, TrackingTimezoneService } from "./food-log.service";
import {
  CreateExerciseLogDto,
  CreateFoodLogDto,
  CreateWaterLogDto,
  TrackingDateQueryDto,
  UpdateExerciseLogDto,
  UpdateFoodLogDto,
  UpdateWaterLogDto,
  UpsertHabitLogDto,
  UpsertSleepLogDto,
} from "./dto/tracking.dto";
import {
  ExerciseLogService,
  HabitLogService,
  SleepLogService,
  WaterLogService,
} from "./water-exercise-sleep-habit.service";
import { TrackingSummaryService } from "./tracking-summary.service";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/tracking")
export class PortalTrackingController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly timezone: TrackingTimezoneService,
    private readonly summary: TrackingSummaryService,
    private readonly foodLogs: FoodLogService,
    private readonly waterLogs: WaterLogService,
    private readonly exerciseLogs: ExerciseLogService,
    private readonly sleepLogs: SleepLogService,
    private readonly habitLogs: HabitLogService,
  ) {}

  @Get("summary")
  @ApiOperation({ summary: "Daily tracking summary for the signed-in client" })
  async summaryForDay(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    const date = await this.resolveDate(client, query.date);
    return this.summary.dailySummary(client, date);
  }

  @Get("food-logs")
  async listFood(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.foodLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Post("food-logs")
  createFood(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: CreateFoodLogDto) {
    return this.withClient(user, (client) => this.foodLogs.createForClient(client, user.id, body));
  }

  @Patch("food-logs/:logId")
  updateFood(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("logId", ParseUUIDPipe) logId: string,
    @Body() body: UpdateFoodLogDto,
  ) {
    return this.withClient(user, (client) => this.foodLogs.updateForClient(client, logId, body));
  }

  @Delete("food-logs/:logId")
  archiveFood(@CurrentUser() user: AuthenticatedRequestUser, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, (client) => this.foodLogs.archiveForClient(client, logId));
  }

  @Get("water-logs")
  async listWater(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.waterLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Post("water-logs")
  createWater(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: CreateWaterLogDto) {
    return this.withClient(user, (client) => this.waterLogs.createForClient(client, user.id, body));
  }

  @Patch("water-logs/:logId")
  updateWater(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("logId", ParseUUIDPipe) logId: string,
    @Body() body: UpdateWaterLogDto,
  ) {
    return this.withClient(user, (client) => this.waterLogs.updateForClient(client, logId, body));
  }

  @Delete("water-logs/:logId")
  archiveWater(@CurrentUser() user: AuthenticatedRequestUser, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, (client) => this.waterLogs.archiveForClient(client, logId));
  }

  @Get("exercise-logs")
  async listExercise(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.exerciseLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Post("exercise-logs")
  createExercise(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: CreateExerciseLogDto) {
    return this.withClient(user, (client) => this.exerciseLogs.createForClient(client, user.id, body));
  }

  @Patch("exercise-logs/:logId")
  updateExercise(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("logId", ParseUUIDPipe) logId: string,
    @Body() body: UpdateExerciseLogDto,
  ) {
    return this.withClient(user, (client) => this.exerciseLogs.updateForClient(client, logId, body));
  }

  @Delete("exercise-logs/:logId")
  archiveExercise(@CurrentUser() user: AuthenticatedRequestUser, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, (client) => this.exerciseLogs.archiveForClient(client, logId));
  }

  @Get("sleep")
  async getSleep(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.sleepLogs.getForClient(client, await this.resolveDate(client, query.date));
  }

  @Put("sleep")
  upsertSleep(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: UpsertSleepLogDto) {
    return this.withClient(user, (client) => this.sleepLogs.upsertForClient(client, user.id, body));
  }

  @Delete("sleep/:logId")
  archiveSleep(@CurrentUser() user: AuthenticatedRequestUser, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, (client) => this.sleepLogs.archiveForClient(client, logId));
  }

  @Get("habits")
  async listHabits(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id);
    return this.habitLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Put("habits")
  upsertHabit(@CurrentUser() user: AuthenticatedRequestUser, @Body() body: UpsertHabitLogDto) {
    return this.withClient(user, (client) => this.habitLogs.upsertForClient(client, user.id, body));
  }

  private async withClient<T>(
    user: AuthenticatedRequestUser,
    fn: (client: Awaited<ReturnType<ClientAccessService["assertPortalAccess"]>>) => Promise<T>,
  ) {
    const client = await this.access.assertPortalAccess(user.id);
    return fn(client);
  }

  private async resolveDate(client: Awaited<ReturnType<ClientAccessService["assertPortalAccess"]>>, date?: string) {
    if (date) {
      this.timezone.parseTrackingDate(date);
      return date;
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    return localDateKey(new Date(), timeZone);
  }
}
