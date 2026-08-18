import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  @ApiOperation({ summary: "Infrastructure health (API, PostgreSQL, Redis, storage)" })
  @ApiOkResponse({ description: "All checks up, or 503 when degraded" })
  @HttpCode(HttpStatus.OK)
  async getHealth(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.check();

    if (result.status !== "ok") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
