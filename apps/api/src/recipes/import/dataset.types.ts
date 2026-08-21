export interface RecipeDatasetSource {
  key: string;
  name: string;
  provider: string;
  datasetVersion: string;
  license: string;
  attribution: string;
  homepage?: string;
}

export interface RecipeDatasetIngredient {
  sourceFoodId: string;
  quantity: number;
  unit: "g" | "kg" | "oz" | "lb" | "ml" | "l" | "fl_oz";
  displayNote?: string;
}

export interface RecipeDatasetRecord {
  sourceRecipeId: string;
  name: string;
  description?: string;
  instructions?: string;
  servings: number;
  category?: string;
  ingredients: RecipeDatasetIngredient[];
}

export interface RecipeDatasetFile {
  source: RecipeDatasetSource;
  recipes: RecipeDatasetRecord[];
}

export interface RecipeImportReport {
  sourceKey: string;
  datasetVersion: string;
  processed: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ sourceRecipeId: string; message: string }>;
}
