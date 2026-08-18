import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import { loadEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger("Worker").log("Worker process started");
}

void bootstrap();
