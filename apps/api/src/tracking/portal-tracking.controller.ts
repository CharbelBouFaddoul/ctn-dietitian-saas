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
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { FoodLogService, TrackingTimezoneService } from "./food-log.service";
import {
  CreateExerciseLogDto,
  CreateFoodLogDto,
  CreateWaterLogDto,
  LogPlannedMealDto,
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
import { PlannedMealLogService } from "./planned-meal-log.service";

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
    private readonly plannedMeals: PlannedMealLogService,
  ) {}

  @Get("summary")
  @ApiOperation({ summary: "Daily tracking summary for the signed-in client" })
  async summaryForDay(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    const date = await this.resolveDate(client, query.date);
    return this.summary.dailySummary(client, date);
  }

  @Get("food-logs")
  async listFood(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.foodLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Post("food-logs")
  createFood(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() body: CreateFoodLogDto) {
    return this.withClient(user, session, (client) => this.foodLogs.createForClient(client, user.id, body));
  }

  @Patch("food-logs/:logId")
  updateFood(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("logId", ParseUUIDPipe) logId: string,
    @Body() body: UpdateFoodLogDto,
  ) {
    return this.withClient(user, session, (client) => this.foodLogs.updateForClient(client, logId, body));
  }

  @Delete("food-logs/:logId")
  archiveFood(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, session, (client) => this.foodLogs.archiveForClient(client, logId));
  }

  @Get("water-logs")
  async listWater(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.waterLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Post("water-logs")
  createWater(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() body: CreateWaterLogDto) {
    return this.withClient(user, session, (client) => this.waterLogs.createForClient(client, user.id, body));
  }

  @Patch("water-logs/:logId")
  updateWater(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("logId", ParseUUIDPipe) logId: string,
    @Body() body: UpdateWaterLogDto,
  ) {
    return this.withClient(user, session, (client) => this.waterLogs.updateForClient(client, logId, body));
  }

  @Delete("water-logs/:logId")
  archiveWater(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, session, (client) => this.waterLogs.archiveForClient(client, logId));
  }

  @Get("exercise-logs")
  async listExercise(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.exerciseLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Post("exercise-logs")
  createExercise(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() body: CreateExerciseLogDto) {
    return this.withClient(user, session, (client) => this.exerciseLogs.createForClient(client, user.id, body));
  }

  @Patch("exercise-logs/:logId")
  updateExercise(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("logId", ParseUUIDPipe) logId: string,
    @Body() body: UpdateExerciseLogDto,
  ) {
    return this.withClient(user, session, (client) => this.exerciseLogs.updateForClient(client, logId, body));
  }

  @Delete("exercise-logs/:logId")
  archiveExercise(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, session, (client) => this.exerciseLogs.archiveForClient(client, logId));
  }

  @Get("sleep")
  async getSleep(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.sleepLogs.getForClient(client, await this.resolveDate(client, query.date));
  }

  @Put("sleep")
  upsertSleep(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() body: UpsertSleepLogDto) {
    return this.withClient(user, session, (client) => this.sleepLogs.upsertForClient(client, user.id, body));
  }

  @Delete("sleep/:logId")
  archiveSleep(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Param("logId", ParseUUIDPipe) logId: string) {
    return this.withClient(user, session, (client) => this.sleepLogs.archiveForClient(client, logId));
  }

  @Get("habits")
  async listHabits(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Query() query: TrackingDateQueryDto) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
    return this.habitLogs.listForClient(client, await this.resolveDate(client, query.date));
  }

  @Put("habits")
  upsertHabit(@CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession, @Body() body: UpsertHabitLogDto) {
    return this.withClient(user, session, (client) => this.habitLogs.upsertForClient(client, user.id, body));
  }

  @Post("log-planned-meal")
  @ApiOperation({
    summary: "Log a published meal-plan meal as one FoodLog (snapshot nutrition × servings)",
  })
  logPlannedMeal(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: LogPlannedMealDto,
  ) {
    return this.withClient(user, session, (client) =>
      this.plannedMeals.logPlannedMeal(client, user.id, body),
    );
  }

  private async withClient<T>(
    user: AuthenticatedRequestUser,
    session: AuthenticatedSession,
    fn: (client: Awaited<ReturnType<ClientAccessService["assertPortalAccess"]>>) => Promise<T>,
  ) {
    const client = await this.access.assertPortalAccess(user.id, { activeClientId: session.activeClientId });
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
