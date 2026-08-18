import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { AutomationSweepService } from "./automation-sweep.service";

export const AUTOMATION_QUEUE = "automation";
export const AUTOMATION_SWEEP_JOB = "sweep";

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
export class AutomationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationQueueService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly sweep: AutomationSweepService) {}

  async onModuleInit(): Promise<void> {
    const connection = bullmqConnection();
    this.queue = new Queue(AUTOMATION_QUEUE, { connection });
    this.worker = new Worker(
      AUTOMATION_QUEUE,
      async (job: Job) => this.processJob(job),
      { connection, concurrency: 2 },
    );

    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();

    await this.queue.add(
      AUTOMATION_SWEEP_JOB,
      {},
      {
        repeat: { every: 5 * 60 * 1000 },
        jobId: AUTOMATION_SWEEP_JOB,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    this.logger.log(`Automation queue ready (${AUTOMATION_QUEUE})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueSweep(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(AUTOMATION_SWEEP_JOB, {}, { removeOnComplete: true });
  }

  private async processJob(job: Job): Promise<{ ok: boolean }> {
    if (job.name === AUTOMATION_SWEEP_JOB) {
      await this.sweep.runSweep();
      return { ok: true };
    }
    return { ok: false };
  }
}
