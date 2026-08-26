"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { formatDate, nutritionLabel } from "../lib/format";
import { activityLabel } from "../lib/practice-labels";

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

export type TrackingActivityRow = {
  id: string;
  type: string;
  occurredAt: string;
  targetType: string | null;
  targetId: string | null;
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
  activities: TrackingActivityRow[];
  activitiesLoading: boolean;
  activitiesPage: number;
  activitiesHasNewer: boolean;
  activitiesHasOlder: boolean;
  onActivitiesNewer: () => void;
  onActivitiesOlder: () => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
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

function formatActivityDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function formatActivityTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function MacroRow({
  label,
  value,
  unit,
  tone,
  share,
}: {
  label: string;
  value: number | null;
  unit: string;
  tone: string;
  share: number;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(share * 100)));
  return (
    <div className="ui-track__macro" data-tone={tone}>
      <div className="ui-track__macro-meta">
        <span>{label}</span>
        <strong>
          {value == null ? "—" : `${Math.round(value * 10) / 10} ${unit}`}
        </strong>
      </div>
      <div className="ui-track__macro-track" aria-hidden="true">
        <span className="ui-track__macro-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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
  activities,
  activitiesLoading,
  activitiesPage,
  activitiesHasNewer,
  activitiesHasOlder,
  onActivitiesNewer,
  onActivitiesOlder,
  notes,
  onNotesChange,
  onSaveNotes,
}: Props) {
  const [openMeals, setOpenMeals] = useState<Record<string, boolean>>({});
  const [activityFilter, setActivityFilter] = useState("all");
  const [habitsOpen, setHabitsOpen] = useState(false);

  const habitsDone = summary?.habits.completed ?? 0;
  const habitsTotal = summary?.habits.total ?? summary?.habits.items.length ?? 0;
  const libraryHref = `/practice/${dietitianAccountId}/habits?fromClient=${encodeURIComponent(clientId)}`;
  const availableToAssign = habitCatalog.filter(
    (h) => !clientHabits.some((c) => c.habitDefinitionId === h.id),
  );

  const macros = useMemo(() => {
    const p = summary?.food.presented;
    return [
      { label: "Energy", value: p?.energyKcal ?? null, unit: "kcal", tone: "energy", weight: p?.energyKcal ?? 0 },
      { label: "Fat", value: p?.fatG ?? null, unit: "g", tone: "fat", weight: (p?.fatG ?? 0) * 9 },
      { label: "Carbohydrate", value: p?.carbohydrateG ?? null, unit: "g", tone: "carb", weight: (p?.carbohydrateG ?? 0) * 4 },
      { label: "Protein", value: p?.proteinG ?? null, unit: "g", tone: "protein", weight: (p?.proteinG ?? 0) * 4 },
      { label: "Fiber", value: p?.fiberG ?? null, unit: "g", tone: "fiber", weight: (p?.fiberG ?? 0) * 2 },
    ];
  }, [summary]);

  const macroMax = Math.max(1, ...macros.map((m) => m.weight));

  const waterPct =
    summary?.water.targetMl != null && summary.water.targetMl > 0
      ? Math.min(100, Math.round((summary.water.totalMl / summary.water.targetMl) * 100))
      : summary && summary.water.totalMl > 0
        ? 55
        : 0;

  const activityTypes = useMemo(() => {
    const set = new Set(activities.map((a) => a.type));
    return Array.from(set).sort();
  }, [activities]);

  const filteredActivities =
    activityFilter === "all" ? activities : activities.filter((a) => a.type === activityFilter);

  function mealOpen(category: string) {
    if (openMeals[category] != null) return openMeals[category]!;
    return true;
  }

  return (
    <div className="ui-track">
      <div className="ui-track__layout">
        <div className="ui-track__main">
          <header className="ui-track__daybar">
            <div>
              <p className="ui-track__eyebrow">Daily tracking</p>
              <h2 className="ui-track__title">{formatDayLabel(trackingDate || summary?.date || "")}</h2>
            </div>
            <div className="ui-track__day-controls">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onShiftDate(-1)}
                disabled={!trackingDate}
              >
                Previous
              </Button>
              <Field label="Date">
                <Input
                  type="date"
                  value={trackingDate}
                  onChange={(event) => onDateChange(event.target.value)}
                />
              </Field>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onShiftDate(1)}
                disabled={!trackingDate}
              >
                Next
              </Button>
            </div>
          </header>

          {!summary ? (
            <div className="ui-track__stack">
              <Skeleton style={{ height: 140, borderRadius: 14 }} />
              <Skeleton style={{ height: 180, borderRadius: 14 }} />
            </div>
          ) : (
            <div className="ui-track__stack">
              <section className="ui-track__card">
                <header className="ui-track__card-head">
                  <h3>Daily analysis</h3>
                  <span className="ui-muted">
                    {nutritionLabel(summary.food.presented.energyKcal, "kcal")} total
                  </span>
                </header>
                <div className="ui-track__macros">
                  {macros.map((m) => (
                    <MacroRow
                      key={m.tone}
                      label={m.label}
                      value={m.value}
                      unit={m.unit}
                      tone={m.tone}
                      share={m.weight / macroMax}
                    />
                  ))}
                </div>
                <div className="ui-track__water">
                  <div className="ui-track__water-meta">
                    <span>Water</span>
                    <strong>
                      {summary.water.targetMl != null
                        ? `${summary.water.totalLiters.toFixed(2)} / ${(summary.water.targetMl / 1000).toFixed(1)} L`
                        : `${summary.water.totalLiters.toFixed(2)} L`}
                    </strong>
                  </div>
                  <div className="ui-track__water-track" aria-hidden="true">
                    <span className="ui-track__water-fill" style={{ width: `${waterPct}%` }} />
                  </div>
                </div>
              </section>

              <section className="ui-track__card">
                <header className="ui-track__card-head">
                  <h3>Food diary</h3>
                  <span className="ui-muted">
                    {summary.food.byMeal.length} meal
                    {summary.food.byMeal.length === 1 ? "" : "s"}
                  </span>
                </header>
                {summary.food.byMeal.length === 0 ? (
                  <EmptyState title="No food logged">Nothing recorded for this day yet.</EmptyState>
                ) : (
                  <div className="ui-track__meals">
                    {summary.food.byMeal.map((meal) => {
                      const open = mealOpen(meal.category);
                      return (
                        <article key={meal.category} className={`ui-track__meal${open ? " is-open" : ""}`}>
                          <button
                            type="button"
                            className="ui-track__meal-toggle"
                            aria-expanded={open}
                            onClick={() =>
                              setOpenMeals((prev) => ({
                                ...prev,
                                [meal.category]: !open,
                              }))
                            }
                          >
                            <span className="ui-track__meal-check" aria-hidden="true">
                              ✓
                            </span>
                            <span className="ui-track__meal-title">{humanizeLabel(meal.category)}</span>
                            <span className="ui-muted">
                              {meal.presented?.energyKcal != null
                                ? `${meal.presented.energyKcal} kcal`
                                : "—"}
                            </span>
                            <span className="ui-track__meal-chevron" aria-hidden="true">
                              {open ? "▾" : "▸"}
                            </span>
                          </button>
                          {open ? (
                            <ul className="ui-track__meal-items">
                              {meal.items.map((row) => (
                                <li key={row.id}>
                                  <span className="ui-track__meal-food">{row.foodName}</span>
                                  <span className="ui-muted">
                                    {row.quantity} {humanizeLabel(row.unit)}
                                  </span>
                                  <strong>
                                    {row.presented?.energyKcal != null
                                      ? `${row.presented.energyKcal} kcal`
                                      : "—"}
                                  </strong>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="ui-track__glance">
                <section className="ui-track__card ui-track__card--compact">
                  <h3>Exercise</h3>
                  {summary.exercise.entries.length === 0 ? (
                    <p className="ui-muted ui-track__empty-line">No exercise logged</p>
                  ) : (
                    <ul className="ui-track__glance-list">
                      {summary.exercise.entries.map((row) => (
                        <li key={row.id}>
                          <strong>{row.activityType}</strong>
                          <span className="ui-muted">
                            {row.durationMinutes} min
                            {row.intensity ? ` · ${humanizeLabel(row.intensity)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="ui-track__card ui-track__card--compact">
                  <h3>Sleep</h3>
                  {summary.sleep?.durationMinutes != null ? (
                    <div className="ui-track__sleep">
                      <p className="ui-track__sleep-value">{formatSleep(summary.sleep.durationMinutes)}</p>
                      <p className="ui-muted" style={{ margin: 0 }}>
                        {summary.sleep.quality != null
                          ? `Quality ${summary.sleep.quality}/5`
                          : "Quality not rated"}
                      </p>
                    </div>
                  ) : (
                    <p className="ui-muted ui-track__empty-line">No sleep logged</p>
                  )}
                </section>

                <section className="ui-track__card ui-track__card--compact">
                  <h3>Habits</h3>
                  <p className="ui-track__habit-summary">
                    {habitsTotal > 0
                      ? `${habitsDone} of ${habitsTotal} completed`
                      : "No habits assigned"}
                  </p>
                  {summary.habits.items.length > 0 ? (
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
                  ) : null}
                </section>
              </div>

              <section className="ui-track__card">
                <button
                  type="button"
                  className="ui-track__assign-toggle"
                  aria-expanded={habitsOpen}
                  onClick={() => setHabitsOpen((v) => !v)}
                >
                  <span>
                    <strong>Assign habits</strong>
                    <span className="ui-muted">
                      {clientHabits.length} assigned · patient completes in portal
                    </span>
                  </span>
                  <span aria-hidden="true">{habitsOpen ? "▾" : "▸"}</span>
                </button>
                {habitsOpen ? (
                  <div className="ui-track__assign-body">
                    <div className="ui-track__assign-actions">
                      <Link href={libraryHref} className="ui-btn ui-btn--secondary ui-btn--sm">
                        Habit library
                      </Link>
                    </div>
                    {habitCatalog.length === 0 ? (
                      <EmptyState
                        title="Habit library is empty"
                        action={
                          <Link href={libraryHref} className="ui-btn ui-btn--primary ui-btn--sm">
                            Create habits
                          </Link>
                        }
                      >
                        Create habits in the library first, then assign them here.
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
                                {availableToAssign.length === 0
                                  ? "All library habits assigned"
                                  : "Select a habit…"}
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
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>

        <aside className="ui-track__activities" aria-label="Timeline">
          <header className="ui-track__activities-head">
            <h3>Timeline</h3>
            <Select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              aria-label="Filter timeline"
            >
              <option value="all">All events</option>
              {activityTypes.map((type) => (
                <option key={type} value={type}>
                  {activityLabel(type)}
                </option>
              ))}
            </Select>
          </header>

          <div className="ui-track__activities-scroll">
            {filteredActivities.length === 0 && !activitiesLoading ? (
              <EmptyState title="No events for this day">
                Timeline updates for the selected date will appear here.
              </EmptyState>
            ) : (
              <ul className="ui-track__activity-list">
                {filteredActivities.map((row) => (
                  <li key={row.id} className="ui-track__activity">
                    <span className="ui-track__activity-date">{formatActivityDate(row.occurredAt)}</span>
                    <div className="ui-track__activity-body">
                      <p>{activityLabel(row.type)}</p>
                      <time dateTime={row.occurredAt}>
                        {formatActivityTime(row.occurredAt)}
                        <span aria-hidden="true"> · </span>
                        {formatDate(row.occurredAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {activitiesLoading && activities.length === 0 ? (
              <p className="ui-muted" style={{ margin: 0 }}>
                Loading timeline…
              </p>
            ) : null}
          </div>

          {activitiesHasNewer || activitiesHasOlder || activitiesPage > 1 ? (
            <div className="ui-track__activities-pager">
              <span className="ui-muted">Page {activitiesPage}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={activitiesLoading || !activitiesHasNewer}
                onClick={onActivitiesNewer}
              >
                Newer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={activitiesLoading || !activitiesHasOlder}
                onClick={onActivitiesOlder}
              >
                {activitiesLoading ? "Loading…" : "Older"}
              </Button>
            </div>
          ) : null}

          <form
            className="ui-track__notes"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNotes();
            }}
          >
            <h4>Clinical notes</h4>
            <Textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              disabled={!allowManage}
              placeholder="Private clinic notes…"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
              Save notes
            </Button>
          </form>
        </aside>
      </div>
    </div>
  );
}
