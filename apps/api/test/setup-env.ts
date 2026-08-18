process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.API_PORT = "3001";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://nutrition:nutrition@localhost:5432/nutrition?schema=public";
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
