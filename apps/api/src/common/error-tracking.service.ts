import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";

interface ErrorContext {
  requestId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  dietitianAccountId?: string;
}

@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger(ErrorTrackingService.name);
  private readonly enabled: boolean;

  constructor(config: ConfigService<AppEnv, true>) {
    this.enabled = config.get("ERROR_TRACKING_ENABLED", { infer: true }) === "true";
  }

  captureException(exception: unknown, context: ErrorContext = {}): void {
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    const payload = {
      level: "error",
      message,
      stack,
      ...context,
    };

    this.logger.error(JSON.stringify(payload));

    if (this.enabled) {
      // Structured logs are forwarded to external monitoring (Coolify log drain, Sentry, etc.).
    }
  }
}
