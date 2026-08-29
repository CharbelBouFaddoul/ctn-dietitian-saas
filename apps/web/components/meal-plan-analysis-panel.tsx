"use client";

import type { ReactNode } from "react";
import { DonutChart, TargetBar } from "@nutrition-saas/ui";
import type { ExtraNutrients } from "../lib/micronutrients";
import type { DailyMacroTargets } from "../lib/nutrition-targets";

type Nutrition = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG?: number | null;
};

type MealItem = {
  id: string;
  itemType: string;
  food: { name: string; category?: string | null } | null;
  recipe: { name: string } | null;
  presented: Nutrition;
};

type Meal = {
  id: string;
  name: string;
  presented: Nutrition;
  items: MealItem[];
};

const MACRO_COLORS = {
  fat: "#e8a82e",
  carb: "#e89a6a",
  protein: "#4f8fe0",
} as const;

const MEAL_COLORS = ["#4f8fe0", "#6aa8eb", "#e89a6a", "#efc08a", "#e8a82e", "#9b7bc4"];

const FAT_COLORS = {
  trans: "#b57a12",
  saturated: "#e8a82e",
  mono: "#d4b03a",
  poly: "#e89a6a",
  other: "#d9c4a0",
} as const;

const CARB_COLORS = {
  sugars: "#de8a45",
  other: "#e8b07a",
} as const;

const FOOD_GROUP_COLORS = [
  "#4f8fe0",
  "#6aa8eb",
  "#e8a82e",
  "#d4b03a",
  "#1f9a82",
  "#3cb8a0",
  "#9b7bc4",
  "#b89ad4",
];

function n(value: number | null | undefined) {
  return value ?? 0;
}

function ChartInfo({ text }: { text: string }) {
  return (
    <span className="ui-mp__chart-info">
      <button type="button" className="ui-mp__chart-info-btn" aria-label="More information">
        i
      </button>
      <span className="ui-mp__chart-info-tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function ChartCard({
  title,
  info,
  children,
}: {
  title: string;
  info?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="ui-mp__card ui-mp__chart-card">
      <header className="ui-mp__chart-card-head">
        <h3>{title}</h3>
        {info ? <ChartInfo text={info} /> : null}
      </header>
      <div className="ui-mp__chart-card-body">{children}</div>
    </section>
  );
}

function foodGroupSlices(meals: Meal[]) {
  const totals = new Map<string, number>();
  for (const meal of meals) {
    for (const item of meal.items) {
      const energy = n(item.presented.energyKcal);
      if (energy <= 0) continue;
      const label =
        item.food?.category?.trim() ||
        (item.itemType === "RECIPE" ? "Recipes" : "Uncategorized");
      totals.set(label, (totals.get(label) ?? 0) + energy);
    }
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const maxNamed = 7;
  const named = ranked.slice(0, maxNamed);
  const rest = ranked.slice(maxNamed);
  const otherValue = rest.reduce((sum, [, value]) => sum + value, 0);
  const otherLabels = rest.map(([label]) => label);
  const slices = named.map(([label, value], index) => ({
    label,
    value,
    color: FOOD_GROUP_COLORS[index % FOOD_GROUP_COLORS.length]!,
  }));
  if (otherValue > 0) {
    slices.push({
      label: "Others",
      value: otherValue,
      color: FOOD_GROUP_COLORS[FOOD_GROUP_COLORS.length - 1]!,
    });
  }
  return { slices, otherLabels };
}

export function MealPlanAnalysisPanel({
  dayLabel,
  presented,
  extras,
  meals,
  macroTargets,
  macroTargetsFromClient,
  compact = false,
}: {
  dayLabel: string;
  presented: Nutrition | undefined;
  extras: ExtraNutrients | undefined;
  meals: Meal[];
  macroTargets: DailyMacroTargets;
  macroTargetsFromClient: boolean;
  compact?: boolean;
}) {
  const sugar = n(presented?.sugarG);
  const carbs = n(presented?.carbohydrateG);
  const otherCarbs = Math.max(0, carbs - sugar);
  const sat = n(extras?.saturatedFatG);
  const mono = n(extras?.monounsaturatedFatG);
  const poly = n(extras?.polyunsaturatedFatG);
  const trans = n(extras?.transFatG);
  const totalFat = n(presented?.fatG);
  const accountedFat = sat + mono + poly + trans;
  const otherFat = Math.max(0, totalFat - accountedFat);

  const foodGroups = foodGroupSlices(meals);
  const chartSize = compact ? 104 : 168;
  const chartThickness = compact ? 24 : 38;
  const sugarMissing = carbs > 0 && sugar <= 0;
  const carbInfo = sugarMissing
    ? "Some foods on this day have no sugar value in the catalog, so sugars vs other carbs may be incomplete."
    : "Sugars vs other carbs depends on sugar values in the food catalog. Items without sugar data contribute only to total carbohydrate.";
  const foodGroupInfo =
    foodGroups.otherLabels.length > 0
      ? `Others: ${foodGroups.otherLabels.join(", ")}`
      : foodGroups.slices.length === 0
        ? "Food groups come from each food’s catalog category. Recipes without a category are listed as Recipes."
        : null;

  return (
    <>
      <section className="ui-mp__card ui-mp__global-analysis">
        <h3>Global analysis</h3>
        <p className="ui-muted ui-mp__source">
          {dayLabel}
          {" · "}
          {macroTargetsFromClient
            ? "Compared to this client’s daily targets"
            : "Using default targets — set daily targets in Prescription"}
        </p>
        <div className="ui-mp__macro-strip">
          <TargetBar
            layout="row"
            label="Energy"
            actual={presented?.energyKcal}
            target={macroTargets.energyKcal}
            unit="kcal"
            tone="energy"
          />
          <TargetBar
            layout="row"
            label="Fat"
            actual={presented?.fatG}
            target={macroTargets.fatG}
            unit="g"
            tone="fat"
          />
          <TargetBar
            layout="row"
            label="Carbohydrate"
            actual={presented?.carbohydrateG}
            target={macroTargets.carbohydrateG}
            unit="g"
            tone="carb"
          />
          <TargetBar
            layout="row"
            label="Protein"
            actual={presented?.proteinG}
            target={macroTargets.proteinG}
            unit="g"
            tone="protein"
          />
          <TargetBar
            layout="row"
            label="Fiber"
            actual={presented?.fiberG}
            target={macroTargets.fiberG}
            unit="g"
            tone="fiber"
          />
        </div>
      </section>

      <div className="ui-mp__chart-grid ui-mp__chart-grid--analysis">
        <ChartCard title="Macronutrients distribution">
          <DonutChart
            size={chartSize}
            thickness={chartThickness}
            showPct={false}
            interactive={!compact}
            valueUnit="kcal"
            slices={[
              { label: "Fat", value: n(presented?.fatG) * 9, color: MACRO_COLORS.fat },
              { label: "Carbohydrate", value: n(presented?.carbohydrateG) * 4, color: MACRO_COLORS.carb },
              { label: "Protein", value: n(presented?.proteinG) * 4, color: MACRO_COLORS.protein },
            ]}
          />
        </ChartCard>

        <ChartCard title="Energy distribution">
          <DonutChart
            size={chartSize}
            thickness={chartThickness}
            showPct={false}
            interactive={!compact}
            valueUnit="kcal"
            slices={meals.map((meal, i) => ({
              label: meal.name,
              value: n(meal.presented.energyKcal),
              color: MEAL_COLORS[i % MEAL_COLORS.length]!,
            }))}
          />
        </ChartCard>

        <ChartCard title="Protein distribution">
          <DonutChart
            size={chartSize}
            thickness={chartThickness}
            showPct={false}
            interactive={!compact}
            valueUnit="g"
            slices={meals.map((meal, i) => ({
              label: meal.name,
              value: n(meal.presented.proteinG),
              color: MEAL_COLORS[i % MEAL_COLORS.length]!,
            }))}
          />
        </ChartCard>

        <ChartCard title="Fats distribution">
          <DonutChart
            size={chartSize}
            thickness={chartThickness}
            showPct={false}
            interactive={!compact}
            valueUnit="g"
            slices={[
              { label: "Trans", value: trans, color: FAT_COLORS.trans },
              { label: "Saturated", value: sat, color: FAT_COLORS.saturated },
              { label: "Monounsaturated", value: mono, color: FAT_COLORS.mono },
              { label: "Polyunsaturated", value: poly, color: FAT_COLORS.poly },
              { label: "Others", value: otherFat, color: FAT_COLORS.other },
            ]}
          />
        </ChartCard>

        <ChartCard title="Carbohydrates distribution" info={compact ? null : carbInfo}>
          <DonutChart
            size={chartSize}
            thickness={chartThickness}
            showPct={false}
            interactive={!compact}
            valueUnit="g"
            slices={[
              { label: "Sugars", value: sugar, color: CARB_COLORS.sugars },
              { label: "Others", value: otherCarbs, color: CARB_COLORS.other },
            ]}
          />
        </ChartCard>

        <ChartCard title="Food groups" info={compact ? null : foodGroupInfo}>
          <DonutChart
            size={chartSize}
            thickness={chartThickness}
            showPct={false}
            interactive={!compact}
            valueUnit="kcal"
            slices={foodGroups.slices}
          />
        </ChartCard>
      </div>
    </>
  );
}
