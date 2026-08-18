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
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
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
  assignedMemberId?: string;

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
  assignedMemberId?: string | null;

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

@ApiTags("organizations")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/tasks")
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query("view") view?: TaskView,
    @Query("status") status?: TaskStatus,
    @Query("priority") priority?: TaskPriority,
    @Query("clientId") clientId?: string,
    @Query("assignedMemberId") assignedMemberId?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.tasks.list(tenant, {
      view,
      status,
      priority,
      clientId,
      assignedMemberId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(":taskId")
  get(@CurrentTenant() tenant: TenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.get(tenant, taskId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateTaskDto) {
    return this.tasks.create(tenant, body);
  }

  @Patch(":taskId")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasks.update(tenant, taskId, body);
  }

  @Post(":taskId/complete")
  complete(@CurrentTenant() tenant: TenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.complete(tenant, taskId);
  }

  @Post(":taskId/cancel")
  cancel(@CurrentTenant() tenant: TenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.cancel(tenant, taskId);
  }

  @Post(":taskId/archive")
  archive(@CurrentTenant() tenant: TenantContext, @Param("taskId", ParseUUIDPipe) taskId: string) {
    return this.tasks.archive(tenant, taskId);
  }
}

@ApiTags("organizations")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard, ClientAccessGuard)
@Controller("api/v1/organizations/:organizationId/clients/:clientId/tasks")
export class ClientTasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.tasks.listForClient(tenant, clientId);
  }
}
