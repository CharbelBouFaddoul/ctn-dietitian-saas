"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

interface Summary {
  date: string;
  food: { logCount: number; presented: Nutrition };
  water: { totalMl: number; totalLiters: number };
  exercise: { totalDurationMinutes: number };
  sleep: { durationMinutes: number | null; quality: number | null } | null;
  habits: {
    total: number;
    completed: number;
    items: Array<{ habitKey: string; habitLabel: string; completed: boolean }>;
  };
}

interface FoodLog {
  id: string;
  foodName: string;
  quantity: number;
  unit: string;
  presented: Nutrition;
}

const DEFAULT_HABITS = [
  { key: "water_goal", label: "Drink water" },
  { key: "vegetables", label: "Eat vegetables" },
  { key: "breakfast", label: "Eat breakfast" },
  { key: "exercise", label: "Exercise" },
  { key: "sleep_target", label: "Sleep before midnight" },
];

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;

function formatKcal(value: number | null): string {
  return value === null ? "—" : `${value} kcal`;
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
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foodQuery, setFoodQuery] = useState("");
  const [foodHits, setFoodHits] = useState<Array<{ id: string; name: string }>>([]);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [waterAmount, setWaterAmount] = useState("500");
  const [activityType, setActivityType] = useState("Walking");
  const [duration, setDuration] = useState("30");
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");

  const habitState = useMemo(() => {
    const map = new Map(summary?.habits.items.map((item) => [item.habitKey, item.completed]) ?? []);
    return DEFAULT_HABITS.map((habit) => ({ ...habit, completed: map.get(habit.key) ?? false }));
  }, [summary]);

  async function load(selectedDate?: string) {
    const sum = await api<Summary>(`/api/v1/portal/tracking/summary${selectedDate ? `?date=${selectedDate}` : ""}`);
    const foods = await api<FoodLog[]>(`/api/v1/portal/tracking/food-logs?date=${sum.date}`);
    setSummary(sum);
    setDate(sum.date);
    setFoodLogs(foods);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load tracking")));
  }, []);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
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
        body: JSON.stringify({ foodId, quantity: Number(quantity), unit }),
      });
      setFoodHits([]);
      await load(date);
    }, "Unable to add food");
  }

  async function addWater(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/portal/tracking/water-logs", {
        method: "POST",
        body: JSON.stringify({ amount: Number(waterAmount), unit: "ml" }),
      });
      await load(date);
    }, "Unable to add water");
  }

  async function addExercise(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/portal/tracking/exercise-logs", {
        method: "POST",
        body: JSON.stringify({ activityType, durationMinutes: Number(duration) }),
      });
      await load(date);
    }, "Unable to add exercise");
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

  async function toggleHabit(habitKey: string, habitLabel: string, completed: boolean) {
    await run(async () => {
      await api("/api/v1/portal/tracking/habits", {
        method: "PUT",
        body: JSON.stringify({ habitKey, habitLabel, date, completed: !completed }),
      });
      await load(date);
    }, "Unable to update habit");
  }

  return (
    <section>
      <PageHeader
        eyebrow="Daily log"
        title="Tracking"
        description="Log food, water, movement, sleep, and habits for the day."
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
      {!summary ? <LoadingState>Loading today’s tracking…</LoadingState> : null}

      {summary ? (
        <div className="ui-client-stack">
          <Section
            className="ui-client-panel ui-client-panel--food"
            title="Food"
            description={`${formatKcal(summary.food.presented.energyKcal)} · Protein ${summary.food.presented.proteinG ?? "—"} g`}
            tone="mint"
          >
            {foodLogs.length === 0 ? (
              <EmptyState title="No food logged yet">Search and add foods below.</EmptyState>
            ) : (
              <ul className="ui-client-meal-items">
                {foodLogs.map((row) => (
                  <li key={row.id}>
                    <span>{row.foodName}</span>
                    <span className="ui-muted">
                      {row.quantity} {unitLabel(row.unit)} · {formatKcal(row.presented.energyKcal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="ui-inline-form" style={{ marginTop: 12 }}>
              <Field label="Search food">
                <Input value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} placeholder="Food name" />
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
              <div className="ui-inline-form__action">
                <Button type="button" disabled={busy} onClick={() => void searchFoods()}>
                  Find
                </Button>
              </div>
            </div>
            {foodHits.length > 0 ? (
              <div className="ui-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                {foodHits.map((hit) => (
                  <Button key={hit.id} type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void addFood(hit.id)}>
                    Add {hit.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </Section>

          <Section className="ui-client-panel ui-client-panel--water" title="Water" description={`${summary.water.totalLiters.toFixed(1)} L today`}>
            <form onSubmit={(event) => void addWater(event)} className="ui-inline-form">
              <Field label="Amount (ml)">
                <Input value={waterAmount} onChange={(event) => setWaterAmount(event.target.value)} />
              </Field>
              <div className="ui-inline-form__action">
                <Button type="submit" disabled={busy}>
                  Add water
                </Button>
              </div>
            </form>
          </Section>

          <Section className="ui-client-panel ui-client-panel--exercise" title="Exercise" description={`${summary.exercise.totalDurationMinutes} min today`}>
            <form onSubmit={(event) => void addExercise(event)} className="ui-inline-form">
              <Field label="Activity">
                <Input value={activityType} onChange={(event) => setActivityType(event.target.value)} />
              </Field>
              <Field label="Minutes">
                <Input value={duration} onChange={(event) => setDuration(event.target.value)} />
              </Field>
              <div className="ui-inline-form__action">
                <Button type="submit" disabled={busy}>
                  Add exercise
                </Button>
              </div>
            </form>
          </Section>

          <Section
            className="ui-client-panel ui-client-panel--sleep"
            title="Sleep"
            description={
              summary.sleep?.durationMinutes
                ? `${Math.floor(summary.sleep.durationMinutes / 60)}h ${summary.sleep.durationMinutes % 60}m`
                : "Not logged yet"
            }
          >
            <form onSubmit={(event) => void saveSleep(event)} className="ui-inline-form">
              <Field label="Bedtime">
                <Input type="datetime-local" value={bedtime} onChange={(event) => setBedtime(event.target.value)} />
              </Field>
              <Field label="Wake time">
                <Input type="datetime-local" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} />
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
            title="Habits"
            description={`${summary.habits.completed} of ${summary.habits.total || DEFAULT_HABITS.length} complete`}
          >
            <ul className="ui-client-habit-list">
              {habitState.map((habit) => (
                <li key={habit.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={habit.completed}
                      disabled={busy}
                      onChange={() => void toggleHabit(habit.key, habit.label, habit.completed)}
                    />
                    <span>{habit.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}
    </section>
  );
}
