import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importFoodDataset } from "../src/foods/import/importer";
import type { FoodDatasetFile } from "../src/foods/import/dataset.types";
import { createAuthTestApp, resetAuthDatabase, type AuthTestContext } from "./app";

const fixturePath = resolve(__dirname, "../food-data/usda-foundation-sample.json");

describe("food dataset import", () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  function loadFixture(): FoodDatasetFile {
    return JSON.parse(readFileSync(fixturePath, "utf8")) as FoodDatasetFile;
  }

  it("imports the sample dataset, preserves identity, and is idempotent", async () => {
    const dataset = loadFixture();
    const first = await importFoodDataset(ctx.prisma, dataset);

    expect(first.processed).toBe(dataset.foods.length);
    expect(first.rejected).toBe(1);
    expect(first.invalidNumericValues).toBe(1);
    expect(first.imported).toBe(12);
    expect(first.updated).toBe(0);
    expect(first.suspiciousCalorieGaps).toBe(1);
    expect(first.datasetVersion).toBe("2024-10-31");

    const chicken = await ctx.prisma.food.findFirstOrThrow({
      where: { sourceFoodId: "171077" },
      include: { source: true },
    });
    expect(chicken.sourceFoodId).toBe("171077");
    expect(chicken.source.datasetVersion).toBe("2024-10-31");
    expect(chicken.source.key).toBe("usda-fdc-foundation-sample");
    expect(Number(chicken.energyKcal)).toBe(165);

    const missingFiber = await ctx.prisma.food.findFirstOrThrow({
      where: { sourceFoodId: "missing-fiber-demo" },
    });
    expect(missingFiber.fiberG).toBeNull();

    const suspicious = await ctx.prisma.food.findFirstOrThrow({
      where: { sourceFoodId: "suspicious-energy-demo" },
    });
    expect(Number(suspicious.energyKcal)).toBe(900);

    const rejected = await ctx.prisma.food.findFirst({
      where: { sourceFoodId: "invalid-negative" },
    });
    expect(rejected).toBeNull();

    const second = await importFoodDataset(ctx.prisma, dataset);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(12);
    expect(second.rejected).toBe(1);
    expect(await ctx.prisma.food.count()).toBe(12);
  });

  it("skips duplicate source IDs in the same file without merging similar names", async () => {
    const dataset = loadFixture();
    dataset.foods = [
      {
        sourceFoodId: "dup-1",
        name: "First name",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 10,
        proteinG: 1,
        carbohydrateG: 1,
        fatG: 1,
      },
      {
        sourceFoodId: "dup-1",
        name: "Second name that looks similar",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 99,
        proteinG: 1,
        carbohydrateG: 1,
        fatG: 1,
      },
    ];
    const report = await importFoodDataset(ctx.prisma, dataset);
    expect(report.duplicateSourceIds).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.imported).toBe(1);
    const row = await ctx.prisma.food.findFirstOrThrow({ where: { sourceFoodId: "dup-1" } });
    expect(row.name).toBe("First name");
    expect(Number(row.energyKcal)).toBe(10);
  });
});
