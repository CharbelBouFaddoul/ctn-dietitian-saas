import { EmptyState, RdaBarList, Table, Td } from "@nutrition-saas/ui";
import { MealPlanAnalysisPanel } from "../meal-plan-analysis-panel";
import type { ExtraNutrients } from "../../lib/micronutrients";
import { MICRONUTRIENT_DEFS } from "../../lib/micronutrients";
import {
  DEFAULT_RDA_PROFILE_ID,
  RDA_PROFILES,
  analysisMicroLabel,
} from "../../lib/nutrition-targets";
import { unitLabel } from "../../lib/practice-labels";
import { DocSection } from "./print-bits";
import type { NutritionAnalysisPrintBody, NutritionPresented } from "./types";

function dayLabel(day: NutritionAnalysisPrintBody["days"][number], index: number) {
  if (day.title) return day.title;
  if (day.weekday) return day.weekday;
  return `Day ${day.dayNumber ?? index + 1}`;
}

function rdaRows(presented: NutritionPresented | undefined, extras: ExtraNutrients | undefined) {
  const profile = RDA_PROFILES[DEFAULT_RDA_PROFILE_ID];
  const vitaminMineral = MICRONUTRIENT_DEFS.filter((def) => def.group !== "lipids").map((def) => ({
    id: def.key,
    label: analysisMicroLabel(def.label),
    actual: extras?.[def.key],
    target: profile.micros[def.key],
    unit: def.unit,
  }));
  return [
    {
      id: "sodiumMg",
      label: "Sodium",
      actual: presented?.sodiumMg,
      target: profile.sodiumMg,
      unit: "mg",
    },
    ...vitaminMineral,
  ].sort((a, b) => a.label.localeCompare(b.label));
}

export function NutritionAnalysisBody({ body }: { body: NutritionAnalysisPrintBody }) {
  if (!body.plan) {
    return <p className="ui-chart-doc__empty">No meal plan</p>;
  }

  const macroTargets = {
    energyKcal: body.targets.energyKcal ?? 2000,
    fatG: body.targets.fatG ?? 70,
    carbohydrateG: body.targets.carbohydrateG ?? 260,
    proteinG: body.targets.proteinG ?? 90,
    fiberG: body.targets.fiberG ?? 28,
  };

  return (
    <div className="ui-chart-doc__analysis">
      <p className="ui-chart-doc__meta">
        {body.plan.name}
        {body.plan.version != null ? ` · version ${body.plan.version}` : ""}
      </p>
      {body.days.length === 0 ? <p className="ui-chart-doc__empty">No analysis for this plan</p> : null}
      {body.days.slice(0, 1).map((day, index) => {
        const foods = day.meals.flatMap((meal) =>
          meal.items.map((item) => ({
            id: `${meal.name}-${item.name}-${item.quantity}`,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            energy: item.presented.energyKcal,
            meal: meal.name,
          })),
        );
        return (
          <div key={`${dayLabel(day, index)}-${index}`} className="ui-mp__analysis">
            <MealPlanAnalysisPanel
              compact
              dayLabel={dayLabel(day, index)}
              presented={day.presented}
              extras={day.extras}
              meals={day.meals.map((meal, mealIndex) => ({
                id: `${dayLabel(day, index)}-${meal.name}-${mealIndex}`,
                name: meal.name,
                presented: meal.presented,
                items: meal.items.map((item, itemIndex) => ({
                  id: `${meal.name}-${itemIndex}`,
                  itemType: item.itemType,
                  food: item.food,
                  recipe: item.food ? null : { name: item.name },
                  presented: item.presented,
                })),
              }))}
              macroTargets={macroTargets}
              macroTargetsFromClient={Boolean(body.targetsFromClient)}
            />

            <section className="ui-mp__card">
              <div className="ui-mp__micro-head">
                <h3>Micronutrients</h3>
              </div>
              <p className="ui-muted ui-mp__source">{RDA_PROFILES[DEFAULT_RDA_PROFILE_ID].basis}</p>
              <RdaBarList rows={rdaRows(day.presented, day.extras)} />
            </section>

            <DocSection title="Foods">
              {foods.length === 0 ? (
                <EmptyState title="No foods on this day" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Energy (kcal)</th>
                      <th>Meal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foods.map((row) => (
                      <tr key={row.id}>
                        <Td label="Name">
                          {row.name} ({row.quantity} {unitLabel(row.unit)})
                        </Td>
                        <Td label="Energy">{row.energy ?? "—"}</Td>
                        <Td label="Meal">{row.meal}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </DocSection>
          </div>
        );
      })}
    </div>
  );
}
