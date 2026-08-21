"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { groupDaysByWeek, weekOfDay } from "../../../../lib/meal-plan-weeks";
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

interface TrackingSummaryLite {
  date: string;
  plannedMeals?: { logged: number; total: number; loggedMealIds?: string[] };
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

function mealHasLoggableItems(meal: Snapshot["days"][number]["meals"][number]): boolean {
  return meal.items.length > 0;
}

export default function ClientPlanPage() {
  const [data, setData] = useState<PortalPlan | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [activeWeek, setActiveWeek] = useState(1);
  const [loggedMealIds, setLoggedMealIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMealId, setBusyMealId] = useState<string | null>(null);

  async function refreshLoggedToday() {
    const summary = await api<TrackingSummaryLite>("/api/v1/portal/tracking/summary");
    setLoggedMealIds(new Set(summary.plannedMeals?.loggedMealIds ?? []));
  }

  useEffect(() => {
    void Promise.all([
      api<PortalPlan>("/api/v1/portal/meal-plan"),
      api<TrackingSummaryLite>("/api/v1/portal/tracking/summary").catch(() => null),
    ])
      .then(([payload, summary]) => {
        setData(payload);
        const first = payload.plan?.snapshot.days[0];
        if (first) setActiveWeek(weekOfDay(first.dayNumber));
        if (summary?.plannedMeals?.loggedMealIds) {
          setLoggedMealIds(new Set(summary.plannedMeals.loggedMealIds));
        }
      })
      .catch((err) => setError(errorMessage(err, "Unable to load your meal plan")))
      .finally(() => setLoading(false));
  }, []);

  async function logMeal(mealId: string, alreadyLogged: boolean) {
    if (alreadyLogged) {
      const ok = window.confirm(
        "You already logged this meal today. Log it again anyway? It will add another entry to your Daily log.",
      );
      if (!ok) return;
    }
    setError(null);
    setNotice(null);
    setBusyMealId(mealId);
    try {
      const result = await api<{ createdCount: number }>("/api/v1/portal/tracking/log-planned-meal", {
        method: "POST",
        body: JSON.stringify({ mealId }),
      });
      setNotice(
        result.createdCount > 0
          ? alreadyLogged
            ? "Logged again — check Daily log for today’s entries."
            : "Added to today’s Daily log."
          : "Nothing was logged for this meal.",
      );
      await refreshLoggedToday();
    } catch (err) {
      setError(errorMessage(err, "Unable to log meal"));
    } finally {
      setBusyMealId(null);
    }
  }

  const plan = data?.plan;
  const weekGroups = useMemo(
    () => (plan ? groupDaysByWeek(plan.snapshot.days) : []),
    [plan],
  );
  const weekCount = weekGroups.length;
  const weekDays = weekGroups.find((g) => g.week === activeWeek)?.days ?? weekGroups[0]?.days ?? [];
  const dayInWeekIndex = Math.min(dayIndex, Math.max(weekDays.length - 1, 0));
  const day = weekDays[dayInWeekIndex];

  return (
    <section className="ui-client-plan-page">
      <PageHeader
        eyebrow="What to eat"
        title="My Plan"
        description="Your dietitian’s meal plan. Use Daily log if you ate something beyond what’s planned here."
        actions={
          <Link href="/client/tracking" className="ui-btn ui-btn--ghost ui-btn--sm">
            Open Daily log
          </Link>
        }
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
        <div className="ui-client-stack">
          <div className="ui-client-plan-intro">
            <div>
              <h2 className="ui-client-plan-intro__title">{plan.name}</h2>
              {plan.description ? <p className="ui-muted">{plan.description}</p> : null}
              {plan.publishedAt ? (
                <p className="ui-muted ui-client-plan-intro__meta">
                  Updated {new Date(plan.publishedAt).toLocaleDateString()}
                  {weekCount > 1 ? ` · ${weekCount} weeks` : ""}
                </p>
              ) : null}
            </div>
          </div>

          {weekCount > 1 ? (
            <div className="ui-client-plan-weeks" role="tablist" aria-label="Plan weeks">
              <p className="ui-client-plan-weeks__label">
                Week {activeWeek} of {weekCount}
              </p>
              <div className="ui-client-plan-weeks__tabs">
                {weekGroups.map((group) => (
                  <button
                    key={group.week}
                    type="button"
                    className={group.week === activeWeek ? "is-active" : undefined}
                    onClick={() => {
                      setActiveWeek(group.week);
                      setDayIndex(0);
                    }}
                  >
                    Week {group.week}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {day ? (
            <Section
              title={dayLabel(day)}
              description={
                [
                  weekCount > 1 ? `Week ${activeWeek}` : null,
                  nutritionSummary(day.presented) || null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              className="ui-client-plan-day-section"
            >
              <div className="ui-client-plan-day" role="tablist" aria-label="Plan days">
                {weekDays.map((item, index) => (
                  <button
                    key={item.dayNumber}
                    type="button"
                    className={index === dayInWeekIndex ? "is-active" : undefined}
                    onClick={() => setDayIndex(index)}
                  >
                    {dayLabel(item)}
                  </button>
                ))}
              </div>
              {day.notes ? <p className="ui-muted">{day.notes}</p> : null}

              <div className="ui-client-plan-meals">
                {day.meals.map((meal) => {
                  const alreadyLogged = loggedMealIds.has(meal.id);
                  return (
                    <article key={meal.id || meal.name} className="ui-client-plan-meal">
                      <header className="ui-client-plan-meal__head">
                        <h3>
                          {meal.name}
                          {meal.presented.energyKcal != null ? (
                            <span className="ui-client-kcal">{meal.presented.energyKcal} kcal</span>
                          ) : null}
                        </h3>
                        <div className="ui-client-plan-meal__tools">
                          {alreadyLogged ? (
                            <span className="ui-client-plan-meal__badge">Logged today</span>
                          ) : null}
                          {mealHasLoggableItems(meal) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busyMealId === meal.id}
                              onClick={() => void logMeal(meal.id, alreadyLogged)}
                            >
                              {busyMealId === meal.id
                                ? "Logging…"
                                : alreadyLogged
                                  ? "Log again"
                                  : "Log to today"}
                            </Button>
                          ) : null}
                        </div>
                      </header>
                      {meal.notes ? <p className="ui-muted ui-client-plan-meal__notes">{meal.notes}</p> : null}
                      <ul className="ui-client-food-list">
                        {meal.items.map((item, index) => (
                          <li key={`${item.food?.name ?? item.recipe?.name}-${index}`}>
                            <div className="ui-client-food-list__main">
                              <span className="ui-client-food-list__name">
                                {item.food?.name ?? item.recipe?.name}
                                {item.recipe ? " (recipe)" : ""}
                              </span>
                              <span className="ui-client-food-list__meta">
                                {item.quantity} {unitLabel(item.unit)}
                                {item.presented.energyKcal != null
                                  ? ` · ${item.presented.energyKcal} kcal`
                                  : ""}
                              </span>
                              {item.notes ? (
                                <span className="ui-muted ui-client-food-list__note">{item.notes}</span>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
