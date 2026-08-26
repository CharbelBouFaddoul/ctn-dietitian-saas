import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FoodDatasetFile } from "./dataset.types";
import { datasetFromFdcJson } from "./fdc-json";

export const FOUNDATION_SOURCE_KEY = "usda-fdc-foundation-curated";

export const FOUNDATION_SOURCE = {
  key: FOUNDATION_SOURCE_KEY,
  name: "USDA Foundation Foods, April 2026",
  provider: "USDA Agricultural Research Service",
  datasetVersion: "2026-04",
  license:
    "United States government work. Public domain in the U.S. Commercial use is permitted. This repository does not claim USDA endorsement.",
  attribution:
    "Nutrient values are adapted from USDA FoodData Central Foundation Foods (April 2026), Agricultural Research Service, U.S. Department of Agriculture. https://fdc.nal.usda.gov/",
  homepage: "https://fdc.nal.usda.gov/",
} as const;

export const FOUNDATION_JSON_ZIP_URL =
  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip";

export const FOUNDATION_DUMP_FILENAME = "FoodData_Central_foundation_food_json_2026-04-30.json";

const DUMP_CANDIDATES = [
  `food-data/.fdc-cache/${FOUNDATION_DUMP_FILENAME}`,
  `apps/api/food-data/.fdc-cache/${FOUNDATION_DUMP_FILENAME}`,
];

export function resolveFoundationDumpPath(explicit?: string): string | null {
  if (explicit) {
    const path = resolve(process.cwd(), explicit);
    return existsSync(path) ? path : null;
  }
  for (const candidate of DUMP_CANDIDATES) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

export function datasetFromFoundationDump(dumpPath: string): FoodDatasetFile {
  return datasetFromFdcJson(dumpPath, { ...FOUNDATION_SOURCE }, ["FoundationFoods", "foundationFoods", "foods"]);
}
