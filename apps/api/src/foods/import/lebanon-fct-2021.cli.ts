import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { replaceCatalogFoods } from "./catalog-replace";
import { importFoodDataset } from "./importer";
import { LEBANON_FCT_2021_SOURCE_KEY, lebanonFct2021Dataset } from "./lebanon-fct-2021-dataset";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

async function main(): Promise<void> {
  const dataset = lebanonFct2021Dataset();
  process.stdout.write(`Importing ${dataset.foods.length} Lebanon 2021 catalog foods\n`);
  const prisma = new PrismaClient();
  try {
    const removed = await replaceCatalogFoods(prisma, LEBANON_FCT_2021_SOURCE_KEY);
    if (removed > 0) process.stdout.write(`Removed ${removed} previous Lebanon 2021 catalog foods\n`);
    const report = await importFoodDataset(prisma, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Lebanon FCT import failed"}\n`);
  process.exitCode = 1;
});
