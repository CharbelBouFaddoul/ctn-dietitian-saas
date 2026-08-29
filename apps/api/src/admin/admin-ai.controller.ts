import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { AiService } from "../ai/ai.service";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

class AdminAiUsageQueryDto {
  @ApiPropertyOptional({ description: "`current` or YYYY-MM" })
  @IsOptional()
  @IsString()
  @Matches(/^(current|\d{4}-\d{2})$/)
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/ai")
export class AdminAiController {
  constructor(private readonly ai: AiService) {}

  @Get("usage")
  @ApiOperation({ summary: "Platform AI usage totals and ranked practices" })
  usage(@Query() query: AdminAiUsageQueryDto) {
    return this.ai.listPlatformUsage(query);
  }
}
