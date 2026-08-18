import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "@nutrition-saas/validation";
import { isSwaggerEnabled } from "./config/env";

export function configureHttpApp(app: INestApplication, env: AppEnv): void {
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  expressApp.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: isSwaggerEnabled(env) ? false : undefined,
    }),
  );
  app.use(cookieParser());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers["x-request-id"];
    req.requestId =
      typeof header === "string" && header.length > 0 ? header.slice(0, 128) : randomUUID();
    next();
  });
  app.enableCors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
