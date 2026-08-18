import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { AppEnv, envSchema } from "@nutrition-saas/validation";
import { assertProductionEnv } from "./production-env";

loadDotenv({ path: join(process.cwd(), ".env") });
loadDotenv({ path: join(process.cwd(), "../../.env") });

export function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  assertProductionEnv(parsed.data);
  return parsed.data;
}

export function isSwaggerEnabled(env: AppEnv): boolean {
  if (env.SWAGGER_ENABLED === "true") {
    return true;
  }

  if (env.SWAGGER_ENABLED === "false") {
    return false;
  }

  return env.NODE_ENV !== "production";
}
