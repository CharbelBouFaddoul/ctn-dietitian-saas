import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { assertDemoWipeAllowed } from "./safety";
import { seedDemoWorld } from "./seed-world";
import { wipeApplicationData } from "./wipe";
import { DEMO_EMAILS, demoPassword } from "./constants";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

async function main(): Promise<void> {
  const mode = process.argv.includes("--seed-only") ? "seed" : "reset";
  const catalog = process.argv.includes("--sample-catalog")
    ? "sample"
    : process.argv.includes("--no-catalog")
      ? "none"
      : "full";

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing demo reset/seed: NODE_ENV=production. Use pg dump/restore + bootstrap:admin for production setup.",
    );
  }

  if (!process.env.FILE_STORAGE_PATH) {
    process.env.FILE_STORAGE_PATH = resolve(process.cwd(), "storage");
  }

  const prisma = new PrismaClient();
  try {
    if (mode === "reset") {
      const dbName = await assertDemoWipeAllowed(prisma);
      process.stdout.write(`[demo] Wiping database "${dbName}"…\n`);
      await wipeApplicationData(prisma);
    } else {
      process.stdout.write("[demo] Seed-only mode (no wipe). Prefer demo:reset for a clean world.\n");
    }

    process.stdout.write(`[demo] Seeding world (catalog=${catalog})…\n`);
    const world = await seedDemoWorld(prisma, { catalog });
    process.stdout.write(
      [
        "[demo] Ready.",
        `  Password: ${world.password}`,
        `  SUPER_ADMIN: ${DEMO_EMAILS.superAdmin}`,
        `  ADMIN: ${DEMO_EMAILS.platformAdmin}`,
        `  Alice (Standard): ${DEMO_EMAILS.alice}`,
        `  Bob (Pro): ${DEMO_EMAILS.bob}`,
        `  Charlie (Premium): ${DEMO_EMAILS.charlie}`,
        `  Shared patient: ${DEMO_EMAILS.sharedPatient}`,
        "  See docs/DEMO.md for the full account matrix.",
      ].join("\n") + "\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

// Keep demoPassword referenced for tree-shaking clarity in docs generation helpers.
void demoPassword;
