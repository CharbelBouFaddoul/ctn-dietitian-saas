import { statusLabel } from "../../lib/practice-labels";
import { DocSection, DocTable, measureText } from "./print-bits";
import type { NutritionPrintBody } from "./types";

export function NutritionBody({ body }: { body: NutritionPrintBody }) {
  if (!body.plan) {
    return <p className="ui-chart-doc__empty">No meal plan</p>;
  }

  return (
    <>
      <p className="ui-chart-doc__meta">
        {body.plan.name}
        {body.plan.version != null ? ` · version ${body.plan.version}` : ""}
        {` · ${statusLabel(body.plan.versionStatus ?? body.plan.status)}`}
      </p>
      {body.days.length === 0 ? <p className="ui-chart-doc__empty">No days in this plan</p> : null}
      {body.days.map((day, index) => (
        <DocSection key={`${day.title ?? "day"}-${index}`} title={day.title || day.weekday || `Day ${index + 1}`}>
          {day.meals.map((meal) => (
            <div key={meal.name} className="ui-chart-doc__meal">
              <h4 className="ui-chart-doc__meal-title">{meal.name}</h4>
              <DocTable
                headers={["Item", "Amount"]}
                rows={meal.items.map((item) => [item.name, measureText(item.quantity, item.unit)])}
                empty="No items"
              />
            </div>
          ))}
        </DocSection>
      ))}
    </>
  );
}
