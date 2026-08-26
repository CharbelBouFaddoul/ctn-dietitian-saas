/** Mirrors @nutrition-saas/nutrition micronutrient catalog for web forms/display. */
export type MicronutrientKey =
  | "cholesterolMg"
  | "saturatedFatG"
  | "transFatG"
  | "monounsaturatedFatG"
  | "polyunsaturatedFatG"
  | "potassiumMg"
  | "calciumMg"
  | "ironMg"
  | "magnesiumMg"
  | "phosphorusMg"
  | "zincMg"
  | "copperMg"
  | "manganeseMg"
  | "seleniumMcg"
  | "vitaminAMcg"
  | "vitaminCMg"
  | "vitaminDMcg"
  | "vitaminEMg"
  | "vitaminKMcg"
  | "thiaminMg"
  | "riboflavinMg"
  | "niacinMg"
  | "vitaminB6Mg"
  | "folateMcg"
  | "vitaminB12Mcg"
  | "cholineMg"
  | "pantothenicAcidMg"
  | "biotinMcg"
  | "fluorideMcg"
  | "iodineMcg";

export type ExtraNutrients = Partial<Record<MicronutrientKey, number | null>>;

export interface MicronutrientDef {
  key: MicronutrientKey;
  label: string;
  unit: string;
  group: "lipids" | "minerals" | "vitamins";
}

export const MICRONUTRIENT_DEFS: readonly MicronutrientDef[] = [
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", group: "lipids" },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g", group: "lipids" },
  { key: "transFatG", label: "Trans fat", unit: "g", group: "lipids" },
  { key: "monounsaturatedFatG", label: "Monounsaturated fat", unit: "g", group: "lipids" },
  { key: "polyunsaturatedFatG", label: "Polyunsaturated fat", unit: "g", group: "lipids" },
  { key: "potassiumMg", label: "Potassium", unit: "mg", group: "minerals" },
  { key: "calciumMg", label: "Calcium", unit: "mg", group: "minerals" },
  { key: "ironMg", label: "Iron", unit: "mg", group: "minerals" },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg", group: "minerals" },
  { key: "phosphorusMg", label: "Phosphorus", unit: "mg", group: "minerals" },
  { key: "zincMg", label: "Zinc", unit: "mg", group: "minerals" },
  { key: "copperMg", label: "Copper", unit: "mg", group: "minerals" },
  { key: "manganeseMg", label: "Manganese", unit: "mg", group: "minerals" },
  { key: "seleniumMcg", label: "Selenium", unit: "µg", group: "minerals" },
  { key: "fluorideMcg", label: "Fluoride", unit: "µg", group: "minerals" },
  { key: "iodineMcg", label: "Iodine", unit: "µg", group: "minerals" },
  { key: "vitaminAMcg", label: "Vitamin A (RAE)", unit: "µg", group: "vitamins" },
  { key: "vitaminCMg", label: "Vitamin C", unit: "mg", group: "vitamins" },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "µg", group: "vitamins" },
  { key: "vitaminEMg", label: "Vitamin E", unit: "mg", group: "vitamins" },
  { key: "vitaminKMcg", label: "Vitamin K", unit: "µg", group: "vitamins" },
  { key: "thiaminMg", label: "Thiamin (B1)", unit: "mg", group: "vitamins" },
  { key: "riboflavinMg", label: "Riboflavin (B2)", unit: "mg", group: "vitamins" },
  { key: "niacinMg", label: "Niacin (B3)", unit: "mg", group: "vitamins" },
  { key: "pantothenicAcidMg", label: "Pantothenic acid (B5)", unit: "mg", group: "vitamins" },
  { key: "vitaminB6Mg", label: "Vitamin B6", unit: "mg", group: "vitamins" },
  { key: "biotinMcg", label: "Biotin (B7)", unit: "µg", group: "vitamins" },
  { key: "folateMcg", label: "Folate", unit: "µg", group: "vitamins" },
  { key: "vitaminB12Mcg", label: "Vitamin B12", unit: "µg", group: "vitamins" },
  { key: "cholineMg", label: "Choline", unit: "mg", group: "vitamins" },
];
