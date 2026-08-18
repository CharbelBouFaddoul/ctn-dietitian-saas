import { DEFAULT_AUTH_TOKEN_SECRET_PLACEHOLDER } from "@nutrition-saas/config";
import type { AppEnv } from "@nutrition-saas/validation";

export function assertProductionEnv(env: AppEnv): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.AUTH_TOKEN_SECRET === DEFAULT_AUTH_TOKEN_SECRET_PLACEHOLDER) {
    throw new Error("AUTH_TOKEN_SECRET must be changed from the default placeholder in production");
  }

  if (env.EMAIL_PROVIDER === "smtp") {
    const missing = ["EMAIL_FROM", "SMTP_HOST", "SMTP_PORT"].filter((key) => !env[key as keyof AppEnv]);
    if (missing.length > 0) {
      throw new Error(`Production SMTP email requires: ${missing.join(", ")}`);
    }
  }
}
