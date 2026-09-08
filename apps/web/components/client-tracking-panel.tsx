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
  humanizeLabel,
} from "@nutrition-saas/ui";
import { FoodInformationDialog } from "./food-information-dialog";
import { FoodInfoIcon } from "./food-info-icon";
import { formatDate, nutritionLabel } from "../lib/format";
import { ChartNotesSection } from "./chart-notes-list";
import {
  careActivityLabel,
  TIMELINE_CATEGORIES,
  typesForTimelineCategory,
  type TimelineCategoryId,
} from "../lib/timeline-care";
import { SearchIcon } from "./list-filters";
import { useOverflowHint } from "../lib/use-overflow-hint";

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
        foodId?: string | null;
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
  description?: string | null;
  category?: string | null;
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
  allowManage: boolean;
  onAssignHabit: (habitDefinitionId: string) => Promise<void> | void;
  onRemoveHabit: (habitDefinitionId: string) => Promise<void> | void;
  activities: TrackingActivityRow[];
  activitiesLoading: boolean;
  activitiesPage: number;
  activitiesHasNewer: boolean;
  activitiesHasOlder: boolean;
  onActivitiesNewer: () => void;
  onActivitiesOlder: () => void;
  onError: (message: string) => void;
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

function habitTargetLabel(habit: {
  targetValue?: number | null;
  targetUnit?: string | null;
  defaultTargetValue?: number | null;
  defaultTargetUnit?: string | null;
}) {
  const value = habit.targetValue ?? habit.defaultTargetValue;
  const unit = habit.targetUnit ?? habit.defaultTargetUnit;
  if (value == null) return null;
  return `${value}${unit ? ` ${unit}` : ""}`;
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
  onError,
}: Props) {
  const [openMeals, setOpenMeals] = useState<Record<string, boolean>>({});
  const [activityFilter, setActivityFilter] = useState<TimelineCategoryId>("all");
  const [habitQuery, setHabitQuery] = useState("");
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);
  const [infoFoodId, setInfoFoodId] = useState<string | null>(null);
  const mainHint = useOverflowHint();
  const railHint = useOverflowHint();

  const habitsDone = summary?.habits.completed ?? 0;
  const habitsTotal = summary?.habits.total ?? summary?.habits.items.length ?? 0;
  const libraryHref = `/practice/${dietitianAccountId}/habits?fromClient=${encodeURIComponent(clientId)}`;
  const availableToAssign = habitCatalog.filter(
    (h) => !clientHabits.some((c) => c.habitDefinitionId === h.id),
  );
  const habitNeedle = habitQuery.trim().toLowerCase();
  const libraryHabits = availableToAssign.filter((habit) => {
    if (!habitNeedle) return true;
    const haystack = `${habit.name} ${habit.category ?? ""} ${habit.description ?? ""}`.toLowerCase();
    return haystack.includes(habitNeedle);
  });

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

  const filteredActivities = useMemo(() => {
    const allowed = new Set(typesForTimelineCategory(activityFilter));
    return activities.filter((a) => allowed.has(a.type));
  }, [activities, activityFilter]);

  function mealOpen(category: string) {
    if (openMeals[category] != null) return openMeals[category]!;
    return true;
  }

  async function assignHabit(habitDefinitionId: string) {
    if (!allowManage || pendingHabitId) return;
    setPendingHabitId(habitDefinitionId);
    try {
      await onAssignHabit(habitDefinitionId);
    } finally {
      setPendingHabitId(null);
    }
  }

  async function removeHabit(habitDefinitionId: string) {
    if (!allowManage || pendingHabitId) return;
    setPendingHabitId(habitDefinitionId);
    try {
      await onRemoveHabit(habitDefinitionId);
    } finally {
      setPendingHabitId(null);
    }
  }

  return (
    <div className="ui-clinical">
      <div
        className={`ui-clinical__pane${mainHint.above ? " is-more-above" : ""}${mainHint.below ? " is-more-below" : ""}`}
      >
        <div className="ui-clinical__main" ref={mainHint.ref}>
          <div className="ui-track">
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
                              <span className="ui-track__meal-kcal">
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
                                    <span className="ui-track__meal-meta">
                                      <span>
                                        {row.quantity} {humanizeLabel(row.unit)}
                                      </span>
                                      <span>
                                        {row.presented?.energyKcal != null
                                          ? `${row.presented.energyKcal} kcal`
                                          : "—"}
                                      </span>
                                    </span>
                                    {row.foodId ? (
                                      <button
                                        type="button"
                                        className="ui-food-info-btn"
                                        aria-label={`Nutrition facts for ${row.foodName}`}
                                        onClick={() => setInfoFoodId(row.foodId!)}
                                      >
                                        <FoodInfoIcon />
                                      </button>
                                    ) : null}
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

                <section className="ui-track__card ui-track__assign-card">
                  <header className="ui-track__card-head ui-track__card-head--assign">
                    <div>
                      <h3>Assign habits</h3>
                      <p className="ui-muted">
                        {clientHabits.length} on this client · completed in the patient portal
                      </p>
                    </div>
                    <Link href={libraryHref} className="ui-btn ui-btn--secondary ui-btn--sm">
                      Habit library
                    </Link>
                  </header>

                  {habitCatalog.length === 0 ? (
                    <EmptyState
                      title="Habit library is empty"
                      action={
                        allowManage ? (
                          <Link href={libraryHref} className="ui-btn ui-btn--primary ui-btn--sm">
                            Create habits
                          </Link>
                        ) : undefined
                      }
                    >
                      Create habits in the library first, then assign them here.
                    </EmptyState>
                  ) : (
                    <div className="ui-track__assign-grid">
                      <div className="ui-track__assign-col">
                        <h4>On this client</h4>
                        {clientHabits.length === 0 ? (
                          <p className="ui-track__assign-empty">No habits assigned yet. Add from the library.</p>
                        ) : (
                          <ul className="ui-track__habit-rows">
                            {clientHabits.map((habit) => {
                              const target = habitTargetLabel(habit);
                              const busy = pendingHabitId === habit.habitDefinitionId;
                              return (
                                <li key={habit.habitDefinitionId} className="ui-track__habit-row is-assigned">
                                  <span className="ui-track__habit-copy">
                                    <strong>{habit.name}</strong>
                                    {target ? <span className="ui-muted">{target}</span> : null}
                                  </span>
                                  {allowManage ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy || pendingHabitId != null}
                                      onClick={() => void removeHabit(habit.habitDefinitionId)}
                                    >
                                      {busy ? "Removing…" : "Remove"}
                                    </Button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      <div className="ui-track__assign-col">
                        <h4>Library</h4>
                        <label className="ui-track__assign-search">
                          <SearchIcon />
                          <input
                            type="search"
                            value={habitQuery}
                            onChange={(event) => setHabitQuery(event.target.value)}
                            placeholder="Search habits"
                            autoComplete="off"
                            aria-label="Search habit library"
                          />
                        </label>
                        {availableToAssign.length === 0 ? (
                          <p className="ui-track__assign-empty">All library habits are assigned to this client.</p>
                        ) : libraryHabits.length === 0 ? (
                          <p className="ui-track__assign-empty">No library habits match this search.</p>
                        ) : (
                          <ul className="ui-track__habit-rows">
                            {libraryHabits.map((habit) => {
                              const target = habitTargetLabel(habit);
                              const busy = pendingHabitId === habit.id;
                              return (
                                <li key={habit.id} className="ui-track__habit-row">
                                  <span className="ui-track__habit-copy">
                                    <strong>{habit.name}</strong>
                                    <span className="ui-muted">
                                      {[habit.scope === "global" ? "Global" : "Clinic", target, habit.category]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  </span>
                                  {allowManage ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={busy || pendingHabitId != null}
                                      onClick={() => void assignHabit(habit.id)}
                                    >
                                      {busy ? "Assigning…" : "Assign"}
                                    </Button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      <aside
        className={`ui-clinical__rail${railHint.above ? " is-more-above" : ""}${railHint.below ? " is-more-below" : ""}`}
        aria-label="Timeline and notes"
      >
        <div className="ui-clinical__rail-scroll" ref={railHint.ref}>
          <section className="ui-clinical-rail">
            <header className="ui-clinical-rail__head">
              <h3>Timeline</h3>
              <Select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as TimelineCategoryId)}
                aria-label="Filter timeline"
                className="ui-track__timeline-filter"
              >
                {TIMELINE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </header>

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
                      <p>{careActivityLabel(row.type)}</p>
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
          </section>

          <ChartNotesSection
            dietitianAccountId={dietitianAccountId}
            clientId={clientId}
            kind="CLINICAL"
            title="Clinical notes"
            empty="No chart notes yet"
            allowManage={allowManage}
            onError={onError}
          />
        </div>
      </aside>

      {infoFoodId ? (
        <FoodInformationDialog
          foodId={infoFoodId}
          dietitianAccountId={dietitianAccountId}
          canMutate={false}
          onClose={() => setInfoFoodId(null)}
        />
      ) : null}
    </div>
  );
}
