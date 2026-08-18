"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

interface Nutrition {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

interface Summary {
  date: string;
  timezone: string;
  food: { logCount: number; presented: Nutrition };
  water: { totalMl: number; totalLiters: number };
  exercise: { totalDurationMinutes: number };
  sleep: { durationMinutes: number | null; quality: number | null } | null;
  habits: { total: number; completed: number; items: Array<{ habitKey: string; habitLabel: string; completed: boolean }> };
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

function formatKcal(value: number | null): string {
  return value === null ? "unknown" : `${value} kcal`;
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
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load tracking"));
  }, []);

  async function searchFoods() {
    const result = await api<{ items: Array<{ id: string; name: string }> }>(
      `/api/v1/portal/foods?q=${encodeURIComponent(foodQuery)}&pageSize=8`,
    );
    setFoodHits(result.items);
  }

  async function addFood(foodId: string) {
    await api("/api/v1/portal/tracking/food-logs", {
      method: "POST",
      body: JSON.stringify({ foodId, quantity: Number(quantity), unit }),
    });
    setFoodHits([]);
    await load(date);
  }

  async function addWater(event: FormEvent) {
    event.preventDefault();
    await api("/api/v1/portal/tracking/water-logs", {
      method: "POST",
      body: JSON.stringify({ amount: Number(waterAmount), unit: "ml" }),
    });
    await load(date);
  }

  async function addExercise(event: FormEvent) {
    event.preventDefault();
    await api("/api/v1/portal/tracking/exercise-logs", {
      method: "POST",
      body: JSON.stringify({ activityType, durationMinutes: Number(duration) }),
    });
    await load(date);
  }

  async function saveSleep(event: FormEvent) {
    event.preventDefault();
    await api("/api/v1/portal/tracking/sleep", {
      method: "PUT",
      body: JSON.stringify({ date, bedtime: bedtime ? new Date(bedtime).toISOString() : undefined, wakeTime: wakeTime ? new Date(wakeTime).toISOString() : undefined }),
    });
    await load(date);
  }

  async function toggleHabit(habitKey: string, habitLabel: string, completed: boolean) {
    await api("/api/v1/portal/tracking/habits", {
      method: "PUT",
      body: JSON.stringify({ habitKey, habitLabel, date, completed: !completed }),
    });
    await load(date);
  }

  return (
    <section>
      <h1>Tracking</h1>
      {error ? (
        <p>
          {error}. <Link href="/auth">Sign in</Link>
        </p>
      ) : null}
      {summary ? (
        <>
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => void load(shiftDate(date, -1))}>
              Previous
            </button>
            <input type="date" value={date} onChange={(event) => void load(event.target.value)} />
            <button type="button" onClick={() => void load(shiftDate(date, 1))}>
              Next
            </button>
            <span style={{ color: "var(--color-muted)" }}>{summary.timezone}</span>
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <article style={{ background: "var(--color-surface)", padding: 12, borderRadius: 8 }}>
              <strong>Food</strong> · {formatKcal(summary.food.presented.energyKcal)} · P {summary.food.presented.proteinG ?? "—"}g
              <ul>
                {foodLogs.map((row) => (
                  <li key={row.id}>
                    {row.foodName} · {row.quantity}
                    {row.unit} · {formatKcal(row.presented.energyKcal)}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <input value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} placeholder="Search food" />
                <input style={{ width: 70 }} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                  {["g", "kg", "oz", "lb", "ml", "l", "fl_oz"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void searchFoods()}>
                  Find
                </button>
                {foodHits.map((hit) => (
                  <button key={hit.id} type="button" onClick={() => void addFood(hit.id)}>
                    Add {hit.name}
                  </button>
                ))}
              </div>
            </article>
            <article style={{ background: "var(--color-surface)", padding: 12, borderRadius: 8 }}>
              <strong>Water</strong> · {(summary.water.totalLiters).toFixed(1)} L
              <form onSubmit={(event) => void addWater(event)} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input value={waterAmount} onChange={(event) => setWaterAmount(event.target.value)} />
                <span>ml</span>
                <button type="submit">Add</button>
              </form>
            </article>
            <article style={{ background: "var(--color-surface)", padding: 12, borderRadius: 8 }}>
              <strong>Exercise</strong> · {summary.exercise.totalDurationMinutes} min
              <form onSubmit={(event) => void addExercise(event)} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <input value={activityType} onChange={(event) => setActivityType(event.target.value)} />
                <input style={{ width: 70 }} value={duration} onChange={(event) => setDuration(event.target.value)} />
                <span>min</span>
                <button type="submit">Add</button>
              </form>
            </article>
            <article style={{ background: "var(--color-surface)", padding: 12, borderRadius: 8 }}>
              <strong>Sleep</strong> ·{" "}
              {summary.sleep?.durationMinutes ? `${Math.floor(summary.sleep.durationMinutes / 60)}h ${summary.sleep.durationMinutes % 60}m` : "—"}
              <form onSubmit={(event) => void saveSleep(event)} style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <label>
                  Bedtime
                  <input type="datetime-local" value={bedtime} onChange={(event) => setBedtime(event.target.value)} />
                </label>
                <label>
                  Wake
                  <input type="datetime-local" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} />
                </label>
                <button type="submit">Save sleep</button>
              </form>
            </article>
            <article style={{ background: "var(--color-surface)", padding: 12, borderRadius: 8 }}>
              <strong>Habits</strong> · {summary.habits.completed}/{summary.habits.total || DEFAULT_HABITS.length} complete
              <ul style={{ listStyle: "none", padding: 0 }}>
                {habitState.map((habit) => (
                  <li key={habit.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={habit.completed}
                        onChange={() => void toggleHabit(habit.key, habit.label, habit.completed)}
                      />{" "}
                      {habit.label}
                    </label>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </section>
  );
}
