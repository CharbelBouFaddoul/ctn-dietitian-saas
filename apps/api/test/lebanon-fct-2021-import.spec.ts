import { describe, expect, it } from "vitest";
import { lebanonFct2021Dataset } from "../src/foods/import/lebanon-fct-2021-dataset";

describe("Lebanon FCT 2021 dataset", () => {
  it("maps 30 traditional dishes and 35 Arabic sweets per 100 g", () => {
    const dataset = lebanonFct2021Dataset();
    expect(dataset.source.key).toBe("lebanon-fct-2021");
    expect(dataset.source.datasetVersion).toBe("2021");
    expect(dataset.foods).toHaveLength(65);
    expect(dataset.foods.filter((row) => row.category === "Traditional dish")).toHaveLength(30);
    expect(dataset.foods.filter((row) => row.category === "Arabic sweet")).toHaveLength(35);

    const hummus = dataset.foods.find((row) => row.sourceFoodId === "lb-2021-hommos-bi-tahini");
    expect(hummus).toMatchObject({
      name: "Hommos bi tahini (hummus)",
      energyKcal: 146,
      proteinG: 7.5,
      carbohydrateG: 17.2,
      fatG: 5.2,
      sugarG: 2.3,
      sodiumMg: 328,
    });
    expect(hummus?.extraNutrients?.ironMg).toBe(1);

    const baklava = dataset.foods.find((row) => row.sourceFoodId === "lb-2021-baklava-mixed");
    expect(baklava).toMatchObject({
      category: "Arabic sweet",
      energyKcal: 474,
      proteinG: 6.6,
      carbohydrateG: 64,
      fatG: 27.3,
      sugarG: null,
      sodiumMg: null,
    });
  });
});
