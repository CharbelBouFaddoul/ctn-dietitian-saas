import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import type { TaskPriority, TaskStatus } from "@prisma/client";
import { SessionGuard } from "../auth/guards/session.guard";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { TaskService, type TaskView } from "./task.service";

class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ enum: ["LOW", "NORMAL", "HIGH", "URGENT"] })
  @IsOptional()
  @IsEnum(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ enum: ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] })
  @IsOptional()
  @IsEnum(["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: ["LOW", "NORMAL", "HIGH", "URGENT"] })
  @IsOptional()
  @IsEnum(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: TaskPriority;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

@ApiTags("dietitian")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/tasks")
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  list(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("view") view?: TaskView | "mine",
    @Query("status") status?: TaskStatus,
    @Query("priority") priority?: TaskPriority,
    @Query("clientId") clientId?: string,
    @Query("assignedUserId") assignedUserId?: string,
    @Query("search") search?: string,
    @Query("dueFrom") dueFrom?: string,
    @Query("dueTo") dueTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.tasks.list(tenant, {
      view,
      status,
      priority,
      clientId,
      assignedUserId,
      search,
      dueFrom,
      dueTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(":taskId")
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.get(tenant, taskId);
  }

  @Post()
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateTaskDto) {
    return this.tasks.create(tenant, body);
  }

  @Patch(":taskId")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasks.update(tenant, taskId, body);
  }

  @Post(":taskId/complete")
  complete(@CurrentTenant() tenant: DietitianTenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.complete(tenant, taskId);
  }

  @Post(":taskId/cancel")
  cancel(@CurrentTenant() tenant: DietitianTenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.cancel(tenant, taskId);
  }

  @Post(":taskId/archive")
  archive(@CurrentTenant() tenant: DietitianTenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.archive(tenant, taskId);
  }
}

@ApiTags("dietitian")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/tasks")
export class ClientTasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  list(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.tasks.listForClient(tenant, clientId);
  }
}
