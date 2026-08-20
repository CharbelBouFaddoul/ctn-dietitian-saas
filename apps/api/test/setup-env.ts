import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.API_PORT = "3001";
// Never inherit DATABASE_URL from .env / the shell. That is the Docker
// development database, and resetAuthDatabase would wipe local logins.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://nutrition:nutrition@localhost:5432/nutrition_test?schema=public";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.FILE_STORAGE_PATH = process.env.FILE_STORAGE_PATH ?? "./storage";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.SWAGGER_ENABLED = "false";
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_TOKEN_SECRET =
  process.env.AUTH_TOKEN_SECRET ?? "test-auth-token-secret-value-32chars-min";
process.env.SESSION_TTL_SECONDS = "604800";
process.env.EMAIL_VERIFICATION_TTL_SECONDS = "86400";
process.env.PASSWORD_RESET_TTL_SECONDS = "3600";
process.env.INVITATION_TTL_SECONDS = "604800";
process.env.PASSWORD_MIN_LENGTH = "10";
process.env.AUTH_THROTTLE_TTL_MS = process.env.AUTH_THROTTLE_TTL_MS ?? "60000";
process.env.AUTH_THROTTLE_LIMIT = process.env.AUTH_THROTTLE_LIMIT ?? "10000";
process.env.MESSAGING_THROTTLE_TTL_MS = process.env.MESSAGING_THROTTLE_TTL_MS ?? "60000";
process.env.MESSAGING_THROTTLE_LIMIT = process.env.MESSAGING_THROTTLE_LIMIT ?? "10000";
process.env.UPLOAD_THROTTLE_TTL_MS = process.env.UPLOAD_THROTTLE_TTL_MS ?? "60000";
process.env.UPLOAD_THROTTLE_LIMIT = process.env.UPLOAD_THROTTLE_LIMIT ?? "10000";
process.env.AI_THROTTLE_TTL_MS = process.env.AI_THROTTLE_TTL_MS ?? "60000";
process.env.AI_THROTTLE_LIMIT = process.env.AI_THROTTLE_LIMIT ?? "10000";
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER ?? "console";
process.env.COOKIE_SECURE = process.env.COOKIE_SECURE ?? "false";

ensureTestDatabase();

function repoRoot(): string {
  if (existsSync(join(process.cwd(), "docker-compose.yml"))) {
    return process.cwd();
  }
  const candidate = join(process.cwd(), "../..");
  if (existsSync(join(candidate, "docker-compose.yml"))) {
    return candidate;
  }
  return process.cwd();
}

function apiRoot(): string {
  if (existsSync(join(process.cwd(), "prisma", "schema.prisma"))) {
    return process.cwd();
  }
  return join(repoRoot(), "apps/api");
}

function ensureTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("/nutrition_test")) {
    return;
  }

  try {
    execSync('docker compose exec -T postgres psql -U nutrition -d postgres -c "CREATE DATABASE nutrition_test"', {
      cwd: repoRoot(),
      stdio: "pipe",
    });
  } catch {
    // Database already exists, or CI provides nutrition_test without Docker Compose.
  }

  execSync("pnpm prisma migrate deploy", {
    cwd: apiRoot(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
