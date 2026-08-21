"use client";

import Link from "next/link";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Section,
  Select,
  Skeleton,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { nutritionLabel } from "../lib/format";

export type TrackingSummaryView = {
  date: string;
  food: {
    presented: {
      energyKcal: number | null;
      proteinG: number | null;
      carbohydrateG: number | null;
      fatG: number | null;
      fiberG: number | null;
    };
    byMeal: Array<{
      category: string;
      items: Array<{
        id: string;
        foodName: string;
        quantity: number;
        unit: string;
        presented: { energyKcal: number | null };
      }>;
      presented: { energyKcal: number | null };
    }>;
  };
  water: {
    totalLiters: number;
    totalMl: number;
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
  sleepWeek: { averageDurationMinutes: number | null; nightsLogged: number };
  habits: {
    completed: number;
    total: number;
    items: Array<{ habitKey: string; habitLabel: string; completed: boolean }>;
  };
  plannedMeals?: { logged: number; total: number };
};

type HabitCatalogItem = {
  id: string;
  name: string;
  scope: string;
  defaultTargetValue: number | null;
  defaultTargetUnit: string | null;
};

type ClientHabit = {
  habitDefinitionId: string;
  name: string;
  targetValue: number | null;
  targetUnit: string | null;
};

type Props = {
  dietitianAccountId: string;
  clientId: string;
  summary: TrackingSummaryView | null;
  trackingDate: string;
  onDateChange: (date: string) => void;
  onShiftDate: (days: number) => void;
  habitCatalog: HabitCatalogItem[];
  clientHabits: ClientHabit[];
  assignHabitId: string;
  onAssignHabitIdChange: (id: string) => void;
  allowManage: boolean;
  onAssignHabit: () => void;
  onRemoveHabit: (habitDefinitionId: string) => void;
};

function formatSleep(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatDayLabel(isoDate: string) {
  if (!isoDate) return "Select a day";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ClientTrackingPanel({
  dietitianAccountId,
  clientId,
  summary,
  trackingDate,
  onDateChange,
  onShiftDate,
  habitCatalog,
  clientHabits,
  assignHabitId,
  onAssignHabitIdChange,
  allowManage,
  onAssignHabit,
  onRemoveHabit,
}: Props) {
  const habitsDone = summary?.habits.completed ?? 0;
  const habitsTotal = summary?.habits.total ?? summary?.habits.items.length ?? 0;
  const libraryHref = `/practice/${dietitianAccountId}/habits?fromClient=${encodeURIComponent(clientId)}`;
  const availableToAssign = habitCatalog.filter(
    (h) => !clientHabits.some((c) => c.habitDefinitionId === h.id),
  );

  return (
    <div className="ui-track">
      <header className="ui-track__daybar">
        <div>
          <p className="ui-track__eyebrow">Daily tracking</p>
          <h2 className="ui-track__title">{formatDayLabel(trackingDate || summary?.date || "")}</h2>
          <p className="ui-muted ui-track__hint">Patient-entered logs for this day. Body measurements stay on Evolution.</p>
        </div>
        <div className="ui-track__day-controls">
          <Button type="button" size="sm" variant="secondary" onClick={() => onShiftDate(-1)} disabled={!trackingDate}>
            Previous
          </Button>
          <Field label="Date">
            <Input type="date" value={trackingDate} onChange={(event) => onDateChange(event.target.value)} />
          </Field>
          <Button type="button" size="sm" variant="secondary" onClick={() => onShiftDate(1)} disabled={!trackingDate}>
            Next
          </Button>
        </div>
      </header>

      {!summary ? (
        <div className="ui-track__metrics">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} style={{ height: 72, borderRadius: 12 }} />
          ))}
        </div>
      ) : (
        <>
          <div className="ui-track__metrics" role="group" aria-label="Day totals">
            <div className="ui-track__metric">
              <span className="ui-track__metric-label">Calories</span>
              <span className="ui-track__metric-value">
                {nutritionLabel(summary.food.presented.energyKcal, "kcal")}
              </span>
            </div>
            <div className="ui-track__metric">
              <span className="ui-track__metric-label">Protein</span>
              <span className="ui-track__metric-value">
                {nutritionLabel(summary.food.presented.proteinG, "g")}
              </span>
            </div>
            <div className="ui-track__metric">
              <span className="ui-track__metric-label">Carbs</span>
              <span className="ui-track__metric-value">
                {nutritionLabel(summary.food.presented.carbohydrateG, "g")}
              </span>
            </div>
            <div className="ui-track__metric">
              <span className="ui-track__metric-label">Fat</span>
              <span className="ui-track__metric-value">
                {nutritionLabel(summary.food.presented.fatG, "g")}
              </span>
            </div>
            <div className="ui-track__metric">
              <span className="ui-track__metric-label">Water</span>
              <span className="ui-track__metric-value">
                {summary.water.targetMl != null
                  ? `${summary.water.totalLiters.toFixed(1)} / ${(summary.water.targetMl / 1000).toFixed(1)} L`
                  : `${summary.water.totalLiters.toFixed(1)} L`}
              </span>
            </div>
            <div className="ui-track__metric">
              <span className="ui-track__metric-label">Exercise</span>
              <span className="ui-track__metric-value">{summary.exercise.totalDurationMinutes} min</span>
            </div>
          </div>

          <Section title="Food by meal" description="Logged meals and snacks for this day.">
            {summary.food.byMeal.length === 0 ? (
              <EmptyState title="No food logged">Nothing recorded for this day yet.</EmptyState>
            ) : (
              <div className="ui-track__meals">
                {summary.food.byMeal.map((meal) => (
                  <article key={meal.category} className="ui-track__meal">
                    <header className="ui-track__meal-head">
                      <h3>{humanizeLabel(meal.category)}</h3>
                      <span className="ui-muted">
                        {meal.presented?.energyKcal != null ? `${meal.presented.energyKcal} kcal` : "—"}
                      </span>
                    </header>
                    <Table>
                      <thead>
                        <tr>
                          <th>Food</th>
                          <th>Quantity</th>
                          <th>Calories</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meal.items.map((row) => (
                          <tr key={row.id}>
                            <Td label="Food">{row.foodName}</Td>
                            <Td label="Quantity">
                              {row.quantity} {humanizeLabel(row.unit)}
                            </Td>
                            <Td label="Calories">
                              {row.presented?.energyKcal != null ? `${row.presented.energyKcal} kcal` : "—"}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </article>
                ))}
              </div>
            )}
          </Section>

          <div className="ui-track__grid">
            <Section title="Water">
              {summary.water.entries.length === 0 ? (
                <EmptyState title="No water logged" />
              ) : (
                <ul className="ui-track__entries">
                  {summary.water.entries.map((row) => (
                    <li key={row.id}>
                      <span>{row.amountMl} ml</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Exercise">
              {summary.exercise.entries.length === 0 ? (
                <EmptyState title="No exercise logged" />
              ) : (
                <ul className="ui-track__entries">
                  {summary.exercise.entries.map((row) => (
                    <li key={row.id}>
                      <span className="ui-track__entry-main">{row.activityType}</span>
                      <span className="ui-muted">
                        {row.durationMinutes} min
                        {row.intensity ? ` · ${humanizeLabel(row.intensity)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Sleep">
              {summary.sleep?.durationMinutes != null ? (
                <div className="ui-track__sleep">
                  <p className="ui-track__sleep-value">{formatSleep(summary.sleep.durationMinutes)}</p>
                  <p className="ui-muted" style={{ margin: 0 }}>
                    {summary.sleep.quality != null ? `Quality ${summary.sleep.quality}/5` : "Quality not rated"}
                    {summary.sleepWeek.averageDurationMinutes != null
                      ? ` · Week avg ${formatSleep(summary.sleepWeek.averageDurationMinutes)}`
                      : ""}
                    {summary.sleepWeek.nightsLogged > 0
                      ? ` · ${summary.sleepWeek.nightsLogged} night${summary.sleepWeek.nightsLogged === 1 ? "" : "s"} logged`
                      : ""}
                  </p>
                </div>
              ) : (
                <EmptyState title="No sleep logged" />
              )}
            </Section>

            <Section
              title="Habits today"
              description={
                habitsTotal > 0
                  ? `${habitsDone} of ${habitsTotal} completed by the patient`
                  : "Patient check-ins for habits assigned below."
              }
            >
              {summary.plannedMeals ? (
                <p className="ui-track__planned">
                  Planned meals logged: {summary.plannedMeals.logged}
                  {summary.plannedMeals.total > 0 ? ` / ${summary.plannedMeals.total}` : ""}
                </p>
              ) : null}
              {summary.habits.items.length === 0 ? (
                <EmptyState title="Nothing to check in today">
                  Assign a habit from the library below. The patient completes it in the portal.
                </EmptyState>
              ) : (
                <ul className="ui-track__habits">
                  {summary.habits.items.map((item) => (
                    <li key={item.habitKey} className={item.completed ? "is-done" : undefined}>
                      <span className="ui-track__habit-mark" aria-hidden="true">
                        {item.completed ? "✓" : ""}
                      </span>
                      <span>{item.habitLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section
            title="Assign habits"
            description="Pick from the habit library for this client. Patients see assigned habits in the portal Tracking checklist."
            actions={
              <Link href={libraryHref} className="ui-btn ui-btn--secondary ui-btn--sm">
                Habit library
              </Link>
            }
          >
            {habitCatalog.length === 0 ? (
              <EmptyState
                title="Habit library is empty"
                action={
                  <Link href={libraryHref} className="ui-btn ui-btn--primary ui-btn--sm">
                    Create habits
                  </Link>
                }
              >
                Create habits in the library first, then return here to assign them.
              </EmptyState>
            ) : (
              <>
                <div className="ui-track__assign">
                  <Field label="Assign from library">
                    <Select
                      value={assignHabitId}
                      onChange={(e) => onAssignHabitIdChange(e.target.value)}
                      disabled={!allowManage || availableToAssign.length === 0}
                    >
                      <option value="">
                        {availableToAssign.length === 0 ? "All library habits assigned" : "Select a habit…"}
                      </option>
                      {availableToAssign.map((habit) => (
                        <option key={habit.id} value={habit.id}>
                          {habit.name}
                          {habit.scope === "global" ? " (global)" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!assignHabitId || !allowManage}
                    onClick={onAssignHabit}
                  >
                    Assign to client
                  </Button>
                </div>
                {clientHabits.length === 0 ? (
                  <p className="ui-muted" style={{ margin: "0.75rem 0 0" }}>
                    No habits assigned to this client yet.
                  </p>
                ) : (
                  <ul className="ui-track__assigned">
                    {clientHabits.map((habit) => (
                      <li key={habit.habitDefinitionId}>
                        <span>
                          {habit.name}
                          {habit.targetValue != null
                            ? ` · ${habit.targetValue}${habit.targetUnit ? ` ${habit.targetUnit}` : ""}`
                            : ""}
                        </span>
                        {allowManage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onRemoveHabit(habit.habitDefinitionId)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
