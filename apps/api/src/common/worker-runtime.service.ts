import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions } from "bullmq";

const SYSTEM_QUEUE = "system";

function bullmqConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error("REDIS_URL is required");
  }

  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class WorkerRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private queue?: Queue;
  private worker?: Worker;

  async onModuleInit(): Promise<void> {
    const connection = bullmqConnection();

    this.queue = new Queue(SYSTEM_QUEUE, { connection });
    this.worker = new Worker(SYSTEM_QUEUE, async () => ({ ok: true }), { connection });

    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();

    this.logger.log(`BullMQ connected (queue: ${SYSTEM_QUEUE})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
