import type { PrismaClient } from "@prisma/client";

const DEMO_WIPE_ALLOWLIST = new Set(["nutrition", "nutrition_demo"]);

export async function assertDemoWipeAllowed(prisma: PrismaClient): Promise<string> {
  if (process.env.DEMO_ALLOW_RESET !== "1") {
    throw new Error(
      "Refusing demo reset: set DEMO_ALLOW_RESET=1 to confirm a destructive wipe of the demo/dev database.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing demo reset: NODE_ENV=production");
  }

  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const name = rows[0]?.current_database ?? "";
  if (!DEMO_WIPE_ALLOWLIST.has(name)) {
    throw new Error(
      `Refusing demo reset: database "${name}" is not in the allowlist (${[...DEMO_WIPE_ALLOWLIST].join(", ")}).`,
    );
  }
  return name;
}

export async function assertTestWipeAllowed(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const name = rows[0]?.current_database ?? "";
  if (name !== "nutrition_test") {
    throw new Error(
      `Refusing to wipe database "${name}". API tests must use nutrition_test, not the Docker development database.`,
    );
  }
}
