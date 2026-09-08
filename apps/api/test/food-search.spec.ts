import { describe, expect, it } from "vitest";
import {
  foodNameMatchesQuery,
  rankFoodsForSearch,
  scoreFoodSearch,
} from "@nutrition-saas/nutrition";

const sr = "usda-fdc-sr-legacy";
const cofid = "cofid-uk";

function names(query: string, foods: Array<{ name: string; sourceKey?: string }>) {
  return rankFoodsForSearch(
    foods.map((food) => ({ ...food, sourceKey: food.sourceKey ?? sr })),
    query,
  ).map((food) => food.name);
}

describe("food search ranking", () => {
  it("treats milk as a whole word, not buttermilk", () => {
    expect(foodNameMatchesQuery("Milk, whole, 3.25% milkfat, with added vitamin D", "milk")).toBe(true);
    expect(foodNameMatchesQuery("Milk, 1% fat, pasteurised", "milk")).toBe(true);
    expect(foodNameMatchesQuery("Buttermilk", "milk")).toBe(false);
    expect(foodNameMatchesQuery("Milk chocolate", "milk")).toBe(true);
  });

  it("ranks drinking milk ahead of bars, canned, chocolate, and dry milk", () => {
    const ranked = names("milk", [
      { name: "Milk and cereal bar" },
      { name: "Milk, canned, condensed, sweetened" },
      { name: "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D" },
      { name: "Milk, dry, whole, with added vitamin D" },
      { name: "Milk, whole, 3.25% milkfat, with added vitamin D" },
      { name: "Milk, whole, pasteurised, average", sourceKey: cofid },
      { name: "Milk, 1% fat, pasteurised", sourceKey: cofid },
      { name: "Milk, fluid, whole, pasteurized, homogenized, 3.25% M.F.", sourceKey: "cnf-canada" },
    ]);
    expect(ranked.slice(0, 4)).toEqual(
      expect.arrayContaining([
        "Milk, 1% fat, pasteurised",
        "Milk, whole, pasteurised, average",
        "Milk, whole, 3.25% milkfat, with added vitamin D",
        "Milk, fluid, whole, pasteurized, homogenized, 3.25% M.F.",
      ]),
    );
    expect(ranked.slice(0, 4)).not.toEqual(
      expect.arrayContaining([
        "Milk and cereal bar",
        "Milk, canned, condensed, sweetened",
        "Milk, dry, whole, with added vitamin D",
        "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D",
      ]),
    );
    expect(ranked.indexOf("Milk and cereal bar")).toBeGreaterThan(4);
    expect(ranked.indexOf("Milk, canned, condensed, sweetened")).toBeGreaterThan(4);
  });

  it("ranks chicken breast ahead of nuggets, broth, baby food, and offal", () => {
    const ranked = names("chicken", [
      { name: "Babyfood, meat, chicken, strained" },
      { name: "Soup, chicken broth, canned, condensed" },
      { name: "Chicken, nuggets, dark and white meat, precooked, frozen, not reheated" },
      { name: "Chicken, feet, boiled" },
      { name: "Chicken spread" },
      { name: "Chicken, broilers or fryers, breast, meat only, raw" },
      { name: "Chicken breast" },
    ]);
    expect(ranked[0]).toBe("Chicken breast");
    expect(ranked[1]).toBe("Chicken, broilers or fryers, breast, meat only, raw");
    for (const demoted of [
      "Chicken, nuggets, dark and white meat, precooked, frozen, not reheated",
      "Soup, chicken broth, canned, condensed",
      "Babyfood, meat, chicken, strained",
      "Chicken, feet, boiled",
      "Chicken spread",
    ]) {
      expect(ranked.indexOf(demoted)).toBeGreaterThan(1);
    }
  });

  it("requires every query token", () => {
    expect(foodNameMatchesQuery("Milk, whole, pasteurised, average", "whole milk")).toBe(true);
    expect(foodNameMatchesQuery("Milk, 1% fat, pasteurised", "whole milk")).toBe(false);
  });

  it("matches spelling aliases such as skim and skimmed", () => {
    expect(foodNameMatchesQuery("Milk, skimmed, pasteurised, average", "skim milk")).toBe(true);
    expect(foodNameMatchesQuery("Yogurt, plain, whole milk", "yoghurt")).toBe(true);
  });

  it("boosts practice custom foods", () => {
    const custom = scoreFoodSearch({ name: "Clinic whole milk", isCustom: true }, "milk");
    const catalog = scoreFoodSearch({ name: "Clinic whole milk", sourceKey: sr }, "milk");
    expect(custom).toBeGreaterThan(catalog);
  });
});
