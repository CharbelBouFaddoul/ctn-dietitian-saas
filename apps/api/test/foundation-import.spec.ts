import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { datasetFromFoundationDump } from "../src/foods/import/foundation-dataset";

const fixturePath = resolve(__dirname, "fixtures/foundation/dump.json");

describe("Foundation dataset conversion", () => {
  it("maps FoundationFoods JSON to macros and extras", () => {
    const dataset = datasetFromFoundationDump(fixturePath);
    expect(dataset.source.key).toBe("usda-fdc-foundation-curated");
    expect(dataset.source.datasetVersion).toBe("2026-04");
    expect(dataset.foods).toHaveLength(3);

    const yogurt = dataset.foods.find((row) => row.sourceFoodId === "330137");
    expect(yogurt).toMatchObject({
      name: "Yogurt, Greek, plain, nonfat",
      category: "Dairy and Egg Products",
      energyKcal: 59,
      proteinG: 10.2,
      fatG: 0.39,
      carbohydrateG: 3.6,
      sodiumMg: 36,
    });
    expect(yogurt?.extraNutrients?.vitaminDMcg).toBe(1.2);
    expect(yogurt?.extraNutrients?.vitaminAMcg).toBe(4);

    const broccoli = dataset.foods.find((row) => row.sourceFoodId === "747447");
    expect(broccoli?.name).toBe("Broccoli, raw");
    expect(broccoli?.fiberG).toBe(2.6);
    expect(broccoli?.extraNutrients?.vitaminCMg).toBe(89.2);

    // Newer Foundation Foods publish kcal as nutrient 957/958 (not classic 208).
    const oats = dataset.foods.find((row) => row.sourceFoodId === "2346396");
    expect(oats?.energyKcal).toBe(382);
    expect(oats?.proteinG).toBe(13.5);
  });
});
