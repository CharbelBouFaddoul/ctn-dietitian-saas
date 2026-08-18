import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import type { AppEnv } from "@nutrition-saas/validation";

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        throttlers: [
          {
            name: THROTTLE_NAMES.AUTH,
            ttl: config.get("AUTH_THROTTLE_TTL_MS", { infer: true }),
            limit: config.get("AUTH_THROTTLE_LIMIT", { infer: true }),
          },
          {
            name: THROTTLE_NAMES.MESSAGING,
            ttl: config.get("MESSAGING_THROTTLE_TTL_MS", { infer: true }),
            limit: config.get("MESSAGING_THROTTLE_LIMIT", { infer: true }),
          },
          {
            name: THROTTLE_NAMES.UPLOAD,
            ttl: config.get("UPLOAD_THROTTLE_TTL_MS", { infer: true }),
            limit: config.get("UPLOAD_THROTTLE_LIMIT", { infer: true }),
          },
          {
            name: THROTTLE_NAMES.AI,
            ttl: config.get("AI_THROTTLE_TTL_MS", { infer: true }),
            limit: config.get("AI_THROTTLE_LIMIT", { infer: true }),
          },
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class AppThrottlerModule {}
