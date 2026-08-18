import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ErrorTrackingService } from "./error-tracking.service";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly errorTracking: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? this.httpMessage(exception)
        : exception instanceof Error
          ? exception.message
          : "Internal server error";

    const payload = {
      statusCode: status,
      message,
      error: HttpStatus[status] ?? "Error",
    };

    if (status >= 500) {
      this.errorTracking.captureException(exception, {
        requestId: request.requestId,
        path: request.path,
        method: request.method,
        statusCode: status,
      });
    } else if (status >= 400) {
      this.logger.warn(
        JSON.stringify({
          requestId: request.requestId,
          path: request.path,
          method: request.method,
          statusCode: status,
          message,
        }),
      );
    }

    response.status(status).json(payload);
  }

  private httpMessage(exception: HttpException): string | string[] {
    const body = exception.getResponse();
    if (typeof body === "string") {
      return body;
    }
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = (body as { message?: string | string[] }).message;
      return message ?? exception.message;
    }
    return exception.message;
  }
}
