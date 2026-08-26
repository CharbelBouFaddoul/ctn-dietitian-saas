const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { config } = require("dotenv");

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Add it to the repo-root .env (Prisma does not load that file by itself).",
  );
  process.exit(1);
}

const result = spawnSync("prisma", process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
