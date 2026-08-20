import { INestApplication, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { ServerOptions } from "socket.io";
import Redis from "ioredis";
import type { AppEnv } from "@nutrition-saas/validation";
import { loadEnv } from "../config/env";

/**
 * Socket.IO adapter backed by the same Redis used for BullMQ/health.
 * Enables cross-instance fan-out without a second messaging bus.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    app: INestApplication,
    private readonly env: AppEnv = loadEnv(),
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = this.env.REDIS_URL;
    this.pubClient = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log("Socket.IO Redis adapter connected");
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const origins = this.env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: origins,
        credentials: true,
      },
      // Cookie auth is validated in the gateway handshake.
      allowEIO3: false,
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async shutdownRedisClients(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(Boolean) as Redis[];
    this.pubClient = null;
    this.subClient = null;
    this.adapterConstructor = null;
    for (const client of clients) {
      client.removeAllListeners("error");
      client.on("error", () => undefined);
      try {
        client.disconnect();
      } catch {
        // ignore teardown races while the Socket.IO adapter unsubscribes
      }
    }
  }
}
