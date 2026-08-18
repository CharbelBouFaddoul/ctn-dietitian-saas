"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

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
    versionNumber: number;
    publishedAt: string | null;
    snapshot: Snapshot;
  } | null;
}

function kcal(value: number | null): string {
  return value === null ? "unknown" : `${value} kcal`;
}

export default function ClientPlanPage() {
  const [data, setData] = useState<PortalPlan | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<PortalPlan>("/api/v1/portal/meal-plan")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load plan"));
  }, []);

  const plan = data?.plan;
  const day = plan?.snapshot.days[dayIndex];

  return (
    <section>
      <h1>Meal plan</h1>
      {error ? (
        <p>
          {error}. <Link href="/auth">Sign in</Link>
        </p>
      ) : null}
      {!plan ? <p>No published meal plan yet.</p> : null}
      {plan ? (
        <>
          <p>
            {plan.name} · version {plan.versionNumber}
          </p>
          {plan.description ? <p>{plan.description}</p> : null}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
            {plan.snapshot.days.map((item, index) => (
              <button
                key={item.dayNumber}
                type="button"
                onClick={() => setDayIndex(index)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 8,
                  border: 0,
                  background: index === dayIndex ? "var(--color-accent)" : "var(--color-surface)",
                  color: index === dayIndex ? "#fff" : "inherit",
                }}
              >
                {item.title ?? `Day ${item.dayNumber}`}
              </button>
            ))}
          </div>
          {day ? (
            <>
              <h2>
                {day.title ?? `Day ${day.dayNumber}`} · {kcal(day.presented.energyKcal)}
              </h2>
              {day.notes ? <p>{day.notes}</p> : null}
              {day.meals.map((meal) => (
                <article key={meal.name} style={{ marginBottom: 16 }}>
                  <h3>
                    {meal.name} · {kcal(meal.presented.energyKcal)}
                  </h3>
                  {meal.notes ? <p style={{ color: "var(--color-muted)" }}>{meal.notes}</p> : null}
                  <ul>
                    {meal.items.map((item, index) => (
                      <li key={`${item.food?.name ?? item.recipe?.name}-${index}`}>
                        {item.food?.name ?? item.recipe?.name} · {item.quantity} {item.unit} · {kcal(item.presented.energyKcal)}
                        {item.notes ? ` · ${item.notes}` : ""}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
