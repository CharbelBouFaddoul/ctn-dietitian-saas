import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is required");
    }

    this.client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === "wait") {
      await this.client.connect();
    }
  }

  async ping(): Promise<boolean> {
    await this.connect();
    const result = await this.client.ping();
    return result === "PONG";
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
