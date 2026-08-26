import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { datasetFromCofidDir, parseCofidNumber } from "../src/foods/import/cofid-dataset";

const fixtureDir = resolve(__dirname, "fixtures/cofid");

describe("CoFID dataset conversion", () => {
  it("maps McCance 2021 sheets including iodine and biotin", () => {
    const dataset = datasetFromCofidDir(fixtureDir);
    expect(dataset.source.key).toBe("cofid-uk");
    expect(dataset.source.datasetVersion).toBe("2021");
    expect(dataset.foods).toHaveLength(2);

    const almonds = dataset.foods.find((row) => row.sourceFoodId === "14-896");
    expect(almonds).toMatchObject({
      name: "Almonds, whole kernels",
      category: "Nuts and seeds",
      energyKcal: 554,
      proteinG: 21.2,
      fatG: 49.9,
      carbohydrateG: 5.3,
      fiberG: 12.5,
      sugarG: 4.5,
      sodiumMg: 1,
    });
    expect(almonds?.extraNutrients?.iodineMcg).toBe(2);
    expect(almonds?.extraNutrients?.biotinMcg).toBe(64);
    expect(almonds?.extraNutrients?.pantothenicAcidMg).toBe(0.47);
    expect(almonds?.extraNutrients?.vitaminEMg).toBe(25.6);
    expect(almonds?.extraNutrients?.vitaminAMcg).toBe(0);

    const ackee = dataset.foods.find((row) => row.sourceFoodId === "13-145");
    expect(ackee?.name).toBe("Ackee, canned, drained");
    expect(ackee?.category).toBe("Vegetables");
    expect(ackee?.energyKcal).toBe(151);
    expect(ackee?.extraNutrients?.iodineMcg).toBe(0);
    expect(ackee?.extraNutrients?.biotinMcg).toBeUndefined();
  });

  it("treats CoFID Tr as zero and N as missing", () => {
    expect(parseCofidNumber("Tr")).toBe(0);
    expect(parseCofidNumber("N")).toBeNull();
    expect(parseCofidNumber("64.0")).toBe(64);
  });
});
