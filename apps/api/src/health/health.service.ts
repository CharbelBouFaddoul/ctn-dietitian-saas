import { Injectable, Logger } from "@nestjs/common";
import type { HealthCheckStatus, HealthResponse } from "@nutrition-saas/types";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis, storage] = await Promise.all([
      this.safeCheck("database", () => this.prisma.ping()),
      this.safeCheck("redis", () => this.redis.ping()),
      this.safeCheck("storage", () => this.storage.ping()),
    ]);

    const checks = {
      api: "up" as HealthCheckStatus,
      database,
      redis,
      storage,
    };

    const degraded = Object.values(checks).some((status) => status === "down");

    return {
      status: degraded ? "degraded" : "ok",
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async safeCheck(
    name: string,
    probe: () => Promise<boolean>,
  ): Promise<HealthCheckStatus> {
    try {
      const ok = await probe();
      return ok ? "up" : "down";
    } catch (error) {
      this.logger.warn(`Health check failed: ${name}`, error instanceof Error ? error.message : error);
      return "down";
    }
  }
}
