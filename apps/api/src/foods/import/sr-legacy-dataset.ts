import { datasetFromFdcJson } from "./fdc-json";
import type { FoodDatasetFile } from "./dataset.types";

export const SR_LEGACY_SOURCE = {
  key: "usda-fdc-sr-legacy",
  name: "USDA SR Legacy, 2018",
  provider: "USDA Agricultural Research Service",
  datasetVersion: "2018-04",
  license:
    "United States government work. Public domain in the U.S. Commercial use is permitted. This repository does not claim USDA endorsement.",
  attribution:
    "Nutrient values are adapted from USDA FoodData Central SR Legacy (April 2018), Agricultural Research Service, U.S. Department of Agriculture. https://fdc.nal.usda.gov/",
  homepage: "https://fdc.nal.usda.gov/",
} as const;

export function datasetFromSrLegacyDump(dumpPath: string): FoodDatasetFile {
  return datasetFromFdcJson(dumpPath, { ...SR_LEGACY_SOURCE }, ["SRLegacyFoods", "SrLegacyFoods", "foods"]);
}
