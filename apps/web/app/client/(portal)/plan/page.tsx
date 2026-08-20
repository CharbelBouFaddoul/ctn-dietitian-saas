"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
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
      id: string;
      name: string;
      notes: string | null;
      presented: Nutrition;
      items: Array<{
        itemType?: string;
        quantity: number;
        unit: string;
        notes: string | null;
        food: { id?: string; name: string } | null;
        recipe: { id?: string; name: string } | null;
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

function mealHasFoodItems(meal: Snapshot["days"][number]["meals"][number]): boolean {
  return meal.items.some(
    (item) => item.itemType === "FOOD" || (item.food != null && item.recipe == null),
  );
}

export default function ClientPlanPage() {
  const [data, setData] = useState<PortalPlan | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMealId, setBusyMealId] = useState<string | null>(null);

  useEffect(() => {
    void api<PortalPlan>("/api/v1/portal/meal-plan")
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load your meal plan")))
      .finally(() => setLoading(false));
  }, []);

  async function logMeal(mealId: string) {
    setError(null);
    setNotice(null);
    setBusyMealId(mealId);
    try {
      const result = await api<{
        createdCount: number;
        skippedRecipes: Array<{ name: string }>;
      }>("/api/v1/portal/tracking/log-planned-meal", {
        method: "POST",
        body: JSON.stringify({ mealId }),
      });
      const recipeNote =
        result.skippedRecipes.length > 0
          ? ` Recipes not auto-logged: ${result.skippedRecipes.map((r) => r.name).join(", ")}.`
          : "";
      setNotice(
        result.createdCount > 0
          ? `Logged ${result.createdCount} food item${result.createdCount === 1 ? "" : "s"}.${recipeNote}`
          : `No food items logged.${recipeNote}`,
      );
    } catch (err) {
      setError(errorMessage(err, "Unable to log meal"));
    } finally {
      setBusyMealId(null);
    }
  }

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
      {notice ? <Alert tone="success">{notice}</Alert> : null}
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
            <Section title={dayLabel(day)} description={nutritionSummary(day.presented) || undefined}>
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
                <details key={meal.id || meal.name} className="ui-client-meal" open>
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
                          {item.presented.energyKcal != null
                            ? ` · ${item.presented.energyKcal} kcal`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {nutritionSummary(meal.presented) ? (
                    <p className="ui-muted" style={{ marginTop: 8, fontSize: 13 }}>
                      Meal nutrition: {nutritionSummary(meal.presented)}
                    </p>
                  ) : null}
                  {mealHasFoodItems(meal) ? (
                    <div style={{ marginTop: 10 }}>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyMealId === meal.id}
                        onClick={() => void logMeal(meal.id)}
                      >
                        {busyMealId === meal.id ? "Logging…" : "Log meal"}
                      </Button>
                      {meal.items.some((i) => i.recipe) ? (
                        <p className="ui-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                          Recipes in this meal are skipped — log those foods separately.
                        </p>
                      ) : null}
                    </div>
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
