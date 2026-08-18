import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { OPENAPI_PATH, SESSION_COOKIE_NAME } from "@nutrition-saas/config";
import { configureHttpApp } from "./app.setup";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/global-exception.filter";
import { ErrorTrackingService } from "./common/error-tracking.service";
import { isSwaggerEnabled, loadEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureHttpApp(app, env);
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(ErrorTrackingService)));

  if (isSwaggerEnabled(env)) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Nutrition SaaS API")
        .setDescription(
          "Phase 4 platform admin, unified organization subscriptions, entitlements, and audit. Cookie session via httpOnly `ns_session`. Organization context comes from the route. Platform admin is authorized by `users.platform_role`.",
        )
        .setVersion("0.4.0")
        .addCookieAuth(SESSION_COOKIE_NAME)
        .build(),
    );
    SwaggerModule.setup(OPENAPI_PATH, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(env.API_PORT);
  const logger = new Logger("Bootstrap");
  logger.log(`API listening on port ${env.API_PORT} (env=${env.NODE_ENV})`);
  if (isSwaggerEnabled(env)) {
    logger.log(`OpenAPI available at /${OPENAPI_PATH}`);
  }
}

void bootstrap();
