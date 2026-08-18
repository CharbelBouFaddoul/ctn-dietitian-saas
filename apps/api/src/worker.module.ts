import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { AutomationWorkerModule } from "./automation/automation-worker.module";
import { WorkerBootstrapService } from "./common/worker-bootstrap.service";
import { WorkerRuntimeService } from "./common/worker-runtime.service";
import { loadEnv } from "./config/env";
import { HealthService } from "./health/health.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "../../.env")],
      validate: loadEnv,
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    AutomationWorkerModule,
  ],
  providers: [HealthService, WorkerRuntimeService, WorkerBootstrapService],
})
export class WorkerModule {}
