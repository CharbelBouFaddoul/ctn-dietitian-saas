import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_TOKEN_SECRET_PLACEHOLDER } from "@nutrition-saas/config";
import { assertProductionEnv } from "../src/config/production-env";
import { isSwaggerEnabled } from "../src/config/env";

describe("production configuration", () => {
  it("disables swagger by default in production", () => {
    expect(isSwaggerEnabled({ NODE_ENV: "production", AUTH_TOKEN_SECRET: "x".repeat(32) } as never)).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: "production", SWAGGER_ENABLED: "true", AUTH_TOKEN_SECRET: "x".repeat(32) } as never)).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: "development", AUTH_TOKEN_SECRET: "x".repeat(32) } as never)).toBe(true);
  });

  it("rejects the default auth secret in production", () => {
    expect(() =>
      assertProductionEnv({
        NODE_ENV: "production",
        AUTH_TOKEN_SECRET: DEFAULT_AUTH_TOKEN_SECRET_PLACEHOLDER,
        EMAIL_PROVIDER: "console",
      } as never),
    ).toThrow(/AUTH_TOKEN_SECRET/);
  });

  it("requires SMTP settings when EMAIL_PROVIDER is smtp in production", () => {
    expect(() =>
      assertProductionEnv({
        NODE_ENV: "production",
        AUTH_TOKEN_SECRET: "x".repeat(32),
        EMAIL_PROVIDER: "smtp",
      } as never),
    ).toThrow(/SMTP/);
  });

  it("allows production with a custom secret and console email", () => {
    expect(() =>
      assertProductionEnv({
        NODE_ENV: "production",
        AUTH_TOKEN_SECRET: "x".repeat(32),
        EMAIL_PROVIDER: "console",
      } as never),
    ).not.toThrow();
  });
});
