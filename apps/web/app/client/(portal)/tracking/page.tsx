"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
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

type MealCategory = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" | "OTHER" | "UNCATEGORIZED";

interface Summary {
  date: string;
  food: {
    logCount: number;
    presented: Nutrition;
    byMeal: Array<{
      category: MealCategory;
      items: Array<{ id: string; foodName: string; quantity: number; unit: string; presented: Nutrition }>;
      presented: Nutrition;
    }>;
  };
  water: {
    totalMl: number;
    totalLiters: number;
    targetMl: number | null;
    entries: Array<{ id: string; amountMl: number }>;
  };
  exercise: {
    totalDurationMinutes: number;
    entries: Array<{
      id: string;
      activityType: string;
      durationMinutes: number;
      intensity: string | null;
    }>;
  };
  sleep: { durationMinutes: number | null; quality: number | null } | null;
  sleepWeek: { nightsLogged: number; averageDurationMinutes: number | null };
  habits: {
    total: number;
    completed: number;
    items: Array<{
      habitKey: string;
      habitLabel: string;
      completed: boolean;
      habitDefinitionId?: string | null;
    }>;
  };
  plannedMeals?: { logged: number; total: number };
}

type PortalHabit = {
  habitDefinitionId: string;
  name: string;
  completed: boolean;
  targetValue: number | null;
  targetUnit: string | null;
};

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;
const MEAL_CATEGORIES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "OTHER"] as const;
const INTENSITIES = ["LOW", "MODERATE", "HIGH"] as const;
const WATER_CHIPS = [250, 500, 750] as const;

const MEAL_LABELS: Record<MealCategory, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
  OTHER: "Other",
  UNCATEGORIZED: "Uncategorized",
};

function formatKcal(value: number | null): string {
  return value === null ? "—" : `${value} kcal`;
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function shiftDate(date: string, days: number): string {
  const parts = date.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export default function ClientTrackingPage() {
  const [date, setDate] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foodQuery, setFoodQuery] = useState("");
  const [foodHits, setFoodHits] = useState<Array<{ id: string; name: string }>>([]);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [mealCategory, setMealCategory] = useState<(typeof MEAL_CATEGORIES)[number]>("LUNCH");
  const [waterAmount, setWaterAmount] = useState("500");
  const [activityType, setActivityType] = useState("Walking");
  const [duration, setDuration] = useState("30");
  const [intensity, setIntensity] = useState<(typeof INTENSITIES)[number]>("MODERATE");
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [weight, setWeight] = useState("");
  const [habits, setHabits] = useState<PortalHabit[]>([]);

  async function loadHabits(selectedDate?: string) {
    const row = await api<{ habits: PortalHabit[] }>(
      `/api/v1/portal/habits${selectedDate ? `?date=${selectedDate}` : ""}`,
    );
    setHabits(row.habits);
  }

  async function load(selectedDate?: string) {
    const sum = await api<Summary>(
      `/api/v1/portal/tracking/summary${selectedDate ? `?date=${selectedDate}` : ""}`,
    );
    setSummary(sum);
    setDate(sum.date);
    await loadHabits(sum.date);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load tracking")));
  }, []);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function searchFoods() {
    await run(async () => {
      const result = await api<{ items: Array<{ id: string; name: string }> }>(
        `/api/v1/portal/foods?q=${encodeURIComponent(foodQuery)}&pageSize=8`,
      );
      setFoodHits(result.items);
    }, "Unable to search foods");
  }

  async function addFood(foodId: string) {
    await run(async () => {
      await api("/api/v1/portal/tracking/food-logs", {
        method: "POST",
        body: JSON.stringify({
          foodId,
          quantity: Number(quantity),
          unit,
          mealCategory,
        }),
      });
      setFoodHits([]);
      await load(date);
    }, "Unable to add food");
  }

  async function removeFood(logId: string) {
    await run(async () => {
      await api(`/api/v1/portal/tracking/food-logs/${logId}`, { method: "DELETE" });
      await load(date);
    }, "Unable to remove food");
  }

  async function addWaterAmount(amountMl: number) {
    await run(async () => {
      await api("/api/v1/portal/tracking/water-logs", {
        method: "POST",
        body: JSON.stringify({ amount: amountMl, unit: "ml" }),
      });
      await load(date);
    }, "Unable to add water");
  }

  async function addWater(event: FormEvent) {
    event.preventDefault();
    await addWaterAmount(Number(waterAmount));
  }

  async function removeWater(logId: string) {
    await run(async () => {
      await api(`/api/v1/portal/tracking/water-logs/${logId}`, { method: "DELETE" });
      await load(date);
    }, "Unable to remove water");
  }

  async function addExercise(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/portal/tracking/exercise-logs", {
        method: "POST",
        body: JSON.stringify({
          activityType,
          durationMinutes: Number(duration),
          intensity,
        }),
      });
      await load(date);
    }, "Unable to add exercise");
  }

  async function removeExercise(logId: string) {
    await run(async () => {
      await api(`/api/v1/portal/tracking/exercise-logs/${logId}`, { method: "DELETE" });
      await load(date);
    }, "Unable to remove exercise");
  }

  async function saveSleep(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/portal/tracking/sleep", {
        method: "PUT",
        body: JSON.stringify({
          date,
          bedtime: bedtime ? new Date(bedtime).toISOString() : undefined,
          wakeTime: wakeTime ? new Date(wakeTime).toISOString() : undefined,
        }),
      });
      await load(date);
    }, "Unable to save sleep");
  }

  async function toggleHabit(habitDefinitionId: string, completed: boolean) {
    await run(async () => {
      await api(`/api/v1/portal/habits/${habitDefinitionId}/log`, {
        method: "PUT",
        body: JSON.stringify({ date, completed: !completed }),
      });
      await load(date);
    }, "Unable to update habit");
  }

  async function logWeight(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/portal/measurements", {
        method: "POST",
        body: JSON.stringify({
          type: "WEIGHT",
          value: Number(weight),
          unit: "kg",
        }),
      });
      setWeight("");
      setNotice("Weight saved. It will appear on Progress.");
    }, "Unable to log weight");
  }

  const waterTarget = summary?.water.targetMl;
  const waterDesc =
    summary == null
      ? undefined
      : waterTarget != null
        ? `${(summary.water.totalMl / 1000).toFixed(2)} L / ${(waterTarget / 1000).toFixed(1)} L`
        : `${summary.water.totalLiters.toFixed(2)} L today`;

  return (
    <section>
      <PageHeader
        eyebrow="Daily log"
        title="Tracking"
        description="Log food, water, movement, sleep, habits, and weight for the day."
        actions={
          summary ? (
            <div className="ui-row">
              <Button variant="secondary" size="sm" onClick={() => void load(shiftDate(date, -1))}>
                Previous
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(event) => void load(event.target.value)}
                aria-label="Tracking date"
                style={{ width: "auto" }}
              />
              <Button variant="secondary" size="sm" onClick={() => void load(shiftDate(date, 1))}>
                Next
              </Button>
            </div>
          ) : null
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {!summary ? <LoadingState>Loading today’s tracking…</LoadingState> : null}

      {summary ? (
        <div className="ui-client-stack">
          <Section
            className="ui-client-panel ui-client-panel--food"
            title="Food"
            description={`${formatKcal(summary.food.presented.energyKcal)} · P ${summary.food.presented.proteinG ?? "—"}g · C ${summary.food.presented.carbohydrateG ?? "—"}g · F ${summary.food.presented.fatG ?? "—"}g · Fiber ${summary.food.presented.fiberG ?? "—"}g`}
            tone="mint"
          >
            {summary.food.byMeal.length === 0 ? (
              <EmptyState title="No food logged yet">Search and add foods below.</EmptyState>
            ) : (
              <div className="ui-stack" style={{ gap: 14 }}>
                {summary.food.byMeal.map((meal) => (
                  <div key={meal.category}>
                    <div className="ui-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                      <strong>{MEAL_LABELS[meal.category] ?? meal.category}</strong>
                      <span className="ui-muted">{formatKcal(meal.presented.energyKcal)}</span>
                    </div>
                    <ul className="ui-client-meal-items">
                      {meal.items.map((row) => (
                        <li key={row.id}>
                          <span>
                            {row.foodName}{" "}
                            <span className="ui-muted">
                              {row.quantity} {unitLabel(row.unit)}
                            </span>
                          </span>
                          <span className="ui-row" style={{ gap: 8, alignItems: "center" }}>
                            <span className="ui-muted">{formatKcal(row.presented.energyKcal)}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void removeFood(row.id)}
                            >
                              Remove
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p style={{ margin: 0, fontWeight: 650 }}>
                  Total {formatKcal(summary.food.presented.energyKcal)}
                </p>
              </div>
            )}
            <div className="ui-inline-form" style={{ marginTop: 12 }}>
              <Field label="Search food">
                <Input
                  value={foodQuery}
                  onChange={(event) => setFoodQuery(event.target.value)}
                  placeholder="Food name"
                />
              </Field>
              <Field label="Amount">
                <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </Field>
              <Field label="Unit">
                <Select value={unit} onChange={(event) => setUnit(event.target.value)}>
                  {UNITS.map((item) => (
                    <option key={item} value={item}>
                      {unitLabel(item)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Meal">
                <Select
                  value={mealCategory}
                  onChange={(event) =>
                    setMealCategory(event.target.value as (typeof MEAL_CATEGORIES)[number])
                  }
                >
                  {MEAL_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {MEAL_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="ui-inline-form__action">
                <Button type="button" disabled={busy} onClick={() => void searchFoods()}>
                  Find
                </Button>
              </div>
            </div>
            {foodHits.length > 0 ? (
              <div className="ui-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                {foodHits.map((hit) => (
                  <Button
                    key={hit.id}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void addFood(hit.id)}
                  >
                    Add {hit.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </Section>

          <Section className="ui-client-panel ui-client-panel--water" title="Water" description={waterDesc}>
            <div className="ui-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {WATER_CHIPS.map((ml) => (
                <Button
                  key={ml}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void addWaterAmount(ml)}
                >
                  +{ml} ml
                </Button>
              ))}
            </div>
            <form onSubmit={(event) => void addWater(event)} className="ui-inline-form">
              <Field label="Custom (ml)">
                <Input value={waterAmount} onChange={(event) => setWaterAmount(event.target.value)} />
              </Field>
              <div className="ui-inline-form__action">
                <Button type="submit" disabled={busy}>
                  Add
                </Button>
              </div>
            </form>
            {summary.water.entries.length > 0 ? (
              <ul className="ui-client-meal-items" style={{ marginTop: 12 }}>
                {summary.water.entries.map((row) => (
                  <li key={row.id}>
                    <span>{row.amountMl} ml</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void removeWater(row.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section
            className="ui-client-panel ui-client-panel--exercise"
            title="Exercise"
            description={`${summary.exercise.totalDurationMinutes} min today`}
          >
            {summary.exercise.entries.length > 0 ? (
              <ul className="ui-client-meal-items" style={{ marginBottom: 12 }}>
                {summary.exercise.entries.map((row) => (
                  <li key={row.id}>
                    <span>
                      {row.activityType} · {row.durationMinutes} min
                      {row.intensity ? ` · ${row.intensity.toLowerCase()}` : ""}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void removeExercise(row.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form onSubmit={(event) => void addExercise(event)} className="ui-inline-form">
              <Field label="Activity">
                <Input value={activityType} onChange={(event) => setActivityType(event.target.value)} />
              </Field>
              <Field label="Minutes">
                <Input value={duration} onChange={(event) => setDuration(event.target.value)} />
              </Field>
              <Field label="Intensity">
                <Select
                  value={intensity}
                  onChange={(event) => setIntensity(event.target.value as (typeof INTENSITIES)[number])}
                >
                  {INTENSITIES.map((item) => (
                    <option key={item} value={item}>
                      {item.charAt(0) + item.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="ui-inline-form__action">
                <Button type="submit" disabled={busy}>
                  Add
                </Button>
              </div>
            </form>
          </Section>

          <Section
            className="ui-client-panel ui-client-panel--sleep"
            title="Sleep"
            description={`Last night ${formatDuration(summary.sleep?.durationMinutes)} · Week avg ${formatDuration(summary.sleepWeek.averageDurationMinutes)}`}
          >
            <form onSubmit={(event) => void saveSleep(event)} className="ui-inline-form">
              <Field label="Bedtime">
                <Input
                  type="datetime-local"
                  value={bedtime}
                  onChange={(event) => setBedtime(event.target.value)}
                />
              </Field>
              <Field label="Wake time">
                <Input
                  type="datetime-local"
                  value={wakeTime}
                  onChange={(event) => setWakeTime(event.target.value)}
                />
              </Field>
              <div className="ui-inline-form__action">
                <Button type="submit" disabled={busy}>
                  Save sleep
                </Button>
              </div>
            </form>
          </Section>

          <Section
            className="ui-client-panel ui-client-panel--habits"
            title="Today's habits"
            description={
              habits.length > 0
                ? `${habits.filter((h) => h.completed).length} of ${habits.length} complete`
                : "No habits assigned yet"
            }
          >
            {habits.length === 0 ? (
              <p className="ui-muted" style={{ margin: 0 }}>
                Your dietitian can assign daily habits for this practice.
              </p>
            ) : (
              <ul className="ui-client-habit-list">
                {habits.map((habit) => (
                  <li key={habit.habitDefinitionId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={habit.completed}
                        disabled={busy}
                        onChange={() => void toggleHabit(habit.habitDefinitionId, habit.completed)}
                      />
                      <span>
                        {habit.name}
                        {habit.targetValue != null
                          ? ` (${habit.targetValue}${habit.targetUnit ? ` ${habit.targetUnit}` : ""})`
                          : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Weight" description="Saved to your measurement history for this practice.">
            <form onSubmit={(event) => void logWeight(event)} className="ui-inline-form">
              <Field label="Weight (kg)">
                <Input
                  value={weight}
                  type="number"
                  min="0.1"
                  step="0.1"
                  onChange={(event) => setWeight(event.target.value)}
                  required
                />
              </Field>
              <div className="ui-inline-form__action">
                <Button type="submit" disabled={busy}>
                  Log weight
                </Button>
              </div>
            </form>
          </Section>
        </div>
      ) : null}
    </section>
  );
}
