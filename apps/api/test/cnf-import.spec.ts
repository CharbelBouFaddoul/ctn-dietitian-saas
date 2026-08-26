import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { datasetFromCnfDir } from "../src/foods/import/cnf-dataset";

const fixtureDir = resolve(__dirname, "fixtures/cnf");

describe("CNF dataset conversion", () => {
  it("maps CNF 2026 Food_Code files to macros and extras", () => {
    const dataset = datasetFromCnfDir(fixtureDir);
    expect(dataset.source.key).toBe("cnf-canada");
    expect(dataset.source.datasetVersion).toBe("2026");
    expect(dataset.foods).toHaveLength(2);

    const souffle = dataset.foods.find((row) => row.sourceFoodId === "2");
    expect(souffle).toMatchObject({
      name: "Cheese souffle",
      category: "Dairy and Egg Products",
      energyKcal: 165,
      proteinG: 9.54,
      fatG: 15.7,
      carbohydrateG: 5.91,
      fiberG: 0.1,
      sodiumMg: 250,
    });
    expect(souffle?.extraNutrients?.vitaminAMcg).toBe(42);
    expect(souffle?.extraNutrients?.vitaminDMcg).toBe(1.2);

    const apple = dataset.foods.find((row) => row.sourceFoodId === "87");
    expect(apple?.name).toBe("Apple, raw");
    expect(apple?.category).toBe("Fruits and fruit juices");
    expect(apple?.energyKcal).toBe(52);
    expect(apple?.proteinG).toBe(0.26);
  });
});
