import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { HealthService } from "../health/health.service";

@Injectable()
export class WorkerBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkerBootstrapService.name);

  constructor(private readonly health: HealthService) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.health.check();
    if (result.status !== "ok") {
      throw new Error(`Worker infrastructure not ready: ${JSON.stringify(result.checks)}`);
    }

    this.logger.log(
      `Worker connected (database=${result.checks.database} redis=${result.checks.redis} storage=${result.checks.storage})`,
    );
  }
}
