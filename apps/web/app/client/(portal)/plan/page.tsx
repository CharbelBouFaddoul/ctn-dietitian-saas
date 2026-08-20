"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { unitLabel } from "../../../../lib/practice-labels";

interface Nutrition {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

interface Snapshot {
  days: Array<{
    dayNumber: number;
    weekday?: string | null;
    title: string | null;
    notes: string | null;
    presented: Nutrition;
    meals: Array<{
      name: string;
      notes: string | null;
      presented: Nutrition;
      items: Array<{
        quantity: number;
        unit: string;
        notes: string | null;
        food: { name: string } | null;
        recipe: { name: string } | null;
        presented: Nutrition;
      }>;
    }>;
  }>;
}

interface PortalPlan {
  plan: {
    name: string;
    description: string | null;
    publishedAt: string | null;
    snapshot: Snapshot;
  } | null;
}

function nutritionSummary(n: Nutrition): string {
  const parts: string[] = [];
  if (n.energyKcal !== null) parts.push(`${n.energyKcal} kcal`);
  if (n.proteinG !== null) parts.push(`Protein ${n.proteinG} g`);
  if (n.carbohydrateG !== null) parts.push(`Carbs ${n.carbohydrateG} g`);
  if (n.fatG !== null) parts.push(`Fat ${n.fatG} g`);
  if (n.fiberG !== null) parts.push(`Fiber ${n.fiberG} g`);
  return parts.join(" · ");
}

function dayLabel(day: { title: string | null; weekday?: string | null; dayNumber: number }): string {
  return day.title ?? day.weekday ?? `Day ${day.dayNumber}`;
}

export default function ClientPlanPage() {
  const [data, setData] = useState<PortalPlan | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<PortalPlan>("/api/v1/portal/meal-plan")
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load your meal plan")))
      .finally(() => setLoading(false));
  }, []);

  const plan = data?.plan;
  const day = plan?.snapshot.days[dayIndex];

  return (
    <section>
      <PageHeader
        eyebrow="Nutrition"
        title="My Plan"
        description="Your current nutrition plan from your dietitian."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? <LoadingState>Loading your plan…</LoadingState> : null}
      {!loading && !plan ? (
        <Section title="My Plan" tone="muted">
          <EmptyState title="No meal plan yet">
            When your dietitian publishes a plan for you, it will show up here day by day.
          </EmptyState>
        </Section>
      ) : null}
      {plan ? (
        <>
          <Section title={plan.name} description={plan.description || undefined} tone="mint">
            {plan.publishedAt ? (
              <p className="ui-muted" style={{ margin: 0 }}>
                Updated {new Date(plan.publishedAt).toLocaleDateString()}
              </p>
            ) : null}
          </Section>

          {day ? (
            <Section
              title={dayLabel(day)}
              description={nutritionSummary(day.presented) || undefined}
            >
              <div className="ui-client-plan-day" role="tablist" aria-label="Plan days">
                {plan.snapshot.days.map((item, index) => (
                  <button
                    key={item.dayNumber}
                    type="button"
                    className={index === dayIndex ? "is-active" : undefined}
                    onClick={() => setDayIndex(index)}
                  >
                    {dayLabel(item)}
                  </button>
                ))}
              </div>
              {day.notes ? <p className="ui-muted">{day.notes}</p> : null}
              {day.meals.map((meal) => (
                <details key={meal.name} className="ui-client-meal" open>
                  <summary>
                    <span>{meal.name}</span>
                    <span className="ui-muted">
                      {meal.presented.energyKcal != null ? `${meal.presented.energyKcal} kcal` : " "}
                    </span>
                  </summary>
                  {meal.notes ? <p className="ui-muted">{meal.notes}</p> : null}
                  <ul className="ui-client-meal-items">
                    {meal.items.map((item, index) => (
                      <li key={`${item.food?.name ?? item.recipe?.name}-${index}`}>
                        <span>
                          {item.food?.name ?? item.recipe?.name}
                          {item.recipe ? " (recipe)" : ""}
                          {item.notes ? ` — ${item.notes}` : ""}
                        </span>
                        <span className="ui-muted">
                          {item.quantity} {unitLabel(item.unit)}
                          {item.presented.energyKcal != null ? ` · ${item.presented.energyKcal} kcal` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {nutritionSummary(meal.presented) ? (
                    <p className="ui-muted" style={{ marginTop: 8, fontSize: 13 }}>
                      Meal nutrition: {nutritionSummary(meal.presented)}
                    </p>
                  ) : null}
                </details>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
