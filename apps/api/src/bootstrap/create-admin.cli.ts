/**
 * Manual one-shot production bootstrap (Coolify execute command — not on deploy).
 *
 * 1) prisma migrate deploy
 * 2) import deploy/bootstrap/database.dump only if User count is 0 (never overwrites)
 * 3) create SUPER_ADMIN from CLI flags
 *
 * Usage (Coolify → API → Execute Command):
 *   pnpm bootstrap:prod -- --email you@ctnsolution.com --password 'YourStrongPass1'
 *   pnpm bootstrap:prod -- --email you@ctnsolution.com --password 'YourStrongPass1' --first-name Your --last-name Name
 *   pnpm bootstrap:prod -- --email you@ctnsolution.com --password 'YourStrongPass1' --force
 *   pnpm bootstrap:prod -- --email you@ctnsolution.com --password 'YourStrongPass1' --skip-import
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const DEFAULT_DUMP = "/app/deploy/bootstrap/database.dump";
const DEFAULT_STORAGE = "/app/deploy/bootstrap/storage.tar.gz";
const DEFAULT_FILE_STORAGE = "/data/storage";

type Args = {
  email?: string;
  password?: string;
  firstName: string;
  lastName: string;
  force: boolean;
  skipImport: boolean;
  dump: string;
  storageArchive: string;
};

function printUsage(): void {
  process.stderr.write(
    [
      "Usage:",
      "  pnpm bootstrap:prod -- --email <email> --password <password> [--first-name N] [--last-name N] [--force] [--skip-import]",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    firstName: "Platform",
    lastName: "Admin",
    force: false,
    skipImport: false,
    dump: DEFAULT_DUMP,
    storageArchive: DEFAULT_STORAGE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--email" && next) {
      out.email = next;
      i += 1;
    } else if (arg === "--password" && next) {
      out.password = next;
      i += 1;
    } else if ((arg === "--first-name" || arg === "--firstName") && next) {
      out.firstName = next;
      i += 1;
    } else if ((arg === "--last-name" || arg === "--lastName") && next) {
      out.lastName = next;
      i += 1;
    } else if (arg === "--dump" && next) {
      out.dump = next;
      i += 1;
    } else if (arg === "--storage" && next) {
      out.storageArchive = next;
      i += 1;
    } else if (arg === "--force") {
      out.force = true;
    } else if (arg === "--skip-import") {
      out.skipImport = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must include at least one letter and one number.");
  }
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}`);
  }
}

function runCapture(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}\n${result.stderr || ""}`,
    );
  }
  return (result.stdout || "").trim();
}

function resolveExistingPath(preferred: string, fallbacks: string[]): string {
  const candidates = [preferred, ...fallbacks];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return preferred;
}

function migrateDeploy(): void {
  process.stdout.write("[bootstrap:prod] Running prisma migrate deploy…\n");
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
}

function importDumpIfEmpty(dump: string, storageArchive: string): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (already set by Coolify for the API).");

  const resolvedDump = resolveExistingPath(dump, [
    resolve(process.cwd(), "deploy/bootstrap/database.dump"),
    resolve(process.cwd(), "../../deploy/bootstrap/database.dump"),
    DEFAULT_DUMP,
  ]);
  if (!existsSync(resolvedDump)) {
    throw new Error(`Dump not found: ${resolvedDump}`);
  }

  const tableExists = runCapture("psql", [
    databaseUrl,
    "-Atqc",
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User';",
  ]);

  let userCount = 0;
  if (tableExists === "1") {
    userCount = Number(
      runCapture("psql", [databaseUrl, "-Atqc", 'SELECT COUNT(*) FROM "User";']) || "0",
    );
  }

  if (userCount > 0) {
    process.stdout.write(
      `[bootstrap:prod] Database already has ${userCount} user(s) — skipping dump import (will never overwrite).\n`,
    );
    return;
  }

  process.stdout.write(`[bootstrap:prod] Empty DB — restoring ${resolvedDump} once…\n`);
  run("pg_restore", ["--clean", "--if-exists", "--no-owner", `--dbname=${databaseUrl}`, resolvedDump]);

  const resolvedStorage = resolveExistingPath(storageArchive, [
    resolve(process.cwd(), "deploy/bootstrap/storage.tar.gz"),
    resolve(process.cwd(), "../../deploy/bootstrap/storage.tar.gz"),
    DEFAULT_STORAGE,
  ]);
  if (existsSync(resolvedStorage)) {
    const fileStoragePath = process.env.FILE_STORAGE_PATH || DEFAULT_FILE_STORAGE;
    const parent = resolve(fileStoragePath, "..");
    process.stdout.write(`[bootstrap:prod] Restoring storage to ${fileStoragePath}…\n`);
    run("mkdir", ["-p", parent]);
    run("tar", ["-xzf", resolvedStorage, "-C", parent]);
  }
}

async function createAdmin(args: Args): Promise<void> {
  const emailRaw = args.email!.trim();
  const password = args.password!;
  assertPasswordPolicy(password);

  const emailNormalized = normalizeEmail(emailRaw);
  const passwordHash = await hashPassword(password);
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({ where: { emailNormalized } });

    if (existing && !args.force) {
      process.stdout.write(
        `[bootstrap:prod] Admin already exists for ${emailNormalized} — skipping (pass --force to update).\n`,
      );
      return;
    }

    if (existing && args.force) {
      await prisma.user.update({
        where: { emailNormalized },
        data: {
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          platformRole: "SUPER_ADMIN",
          firstName: args.firstName,
          lastName: args.lastName,
          suspendedAt: null,
          archivedAt: null,
        },
      });
      process.stdout.write(`[bootstrap:prod] Updated SUPER_ADMIN: ${emailNormalized}\n`);
      return;
    }

    await prisma.user.create({
      data: {
        email: emailRaw,
        emailNormalized,
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        platformRole: "SUPER_ADMIN",
        firstName: args.firstName,
        lastName: args.lastName,
      },
    });
    process.stdout.write(`[bootstrap:prod] Created SUPER_ADMIN: ${emailNormalized}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    printUsage();
    throw new Error("--email and --password are required.");
  }

  migrateDeploy();

  if (!args.skipImport) {
    importDumpIfEmpty(args.dump, args.storageArchive);
    migrateDeploy();
  }

  await createAdmin(args);
  process.stdout.write("[bootstrap:prod] Done.\n");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
