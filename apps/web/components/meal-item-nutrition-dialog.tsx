"use client";

import { Button, Dialog } from "@nutrition-saas/ui";
import { MICRONUTRIENT_DEFS, type ExtraNutrients } from "../lib/micronutrients";
import { foodSourceCaption } from "../lib/food-source-label";
import { unitLabel } from "../lib/practice-labels";

export type MealItemNutrition = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
};

export type MealItemDetail = {
  name: string;
  quantity: number;
  unit: string;
  servingDescription?: string | null;
  amountCaption: string;
  presented: MealItemNutrition;
  presentedExtraNutrients?: ExtraNutrients;
  origin?: "catalog" | "custom";
  source?: { key?: string | null; name: string; datasetVersion?: string | null } | null;
};

function trimQty(value: number) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function fmtValue(value: number | null | undefined, unit: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  const decimals = unit === "g" || unit === "mg" ? (Math.abs(value) < 10 ? 1 : 0) : unit === "µg" ? 1 : 0;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals)} ${unit}`;
}

function detailRows(item: MealItemDetail) {
  const extras = item.presentedExtraNutrients ?? {};
  const presented = item.presented;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Cholesterol", value: fmtValue(extras.cholesterolMg, "mg") },
    { label: "Fiber", value: fmtValue(presented.fiberG, "g") },
    { label: "Sodium", value: fmtValue(presented.sodiumMg, "mg") },
    { label: "Sugars", value: fmtValue(presented.sugarG, "g") },
  ];
  for (const def of MICRONUTRIENT_DEFS) {
    if (def.key === "cholesterolMg") continue;
    rows.push({ label: def.label, value: fmtValue(extras[def.key], def.unit) });
  }
  return rows;
}

export function MealItemNutritionDialog({
  item,
  onClose,
}: {
  item: MealItemDetail | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const rows = detailRows(item);
  const source = foodSourceCaption(item.source, item.origin);
  return (
    <Dialog open title={item.name} onClose={onClose} className="ui-food-nutri">
      <p className="ui-food-nutri__serving">
        {item.servingDescription?.trim()
          ? `${item.servingDescription} · ${item.amountCaption}`
          : `${trimQty(item.quantity)} ${unitLabel(item.unit)}${item.amountCaption ? ` (${item.amountCaption})` : ""}`}
      </p>
      <div className="ui-food-nutri__macros">
        <span className="ui-food-nutri__chip" data-tone="energy">
          <strong>Energy</strong>
          {fmtValue(item.presented.energyKcal, "kcal")}
        </span>
        <span className="ui-food-nutri__chip" data-tone="fat">
          <strong>Fat</strong>
          {fmtValue(item.presented.fatG, "g")}
        </span>
        <span className="ui-food-nutri__chip" data-tone="carb">
          <strong>Carbohydrate</strong>
          {fmtValue(item.presented.carbohydrateG, "g")}
        </span>
        <span className="ui-food-nutri__chip" data-tone="protein">
          <strong>Protein</strong>
          {fmtValue(item.presented.proteinG, "g")}
        </span>
      </div>
      <h3 className="ui-food-nutri__heading">Micronutrients</h3>
      <div className="ui-food-nutri__grid">
        {rows.map((row) => (
          <div key={row.label} className="ui-food-nutri__row">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="ui-food-nutri__foot">
        <p className="ui-muted">{source ? `Source: ${source}` : "Source not recorded"}</p>
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
