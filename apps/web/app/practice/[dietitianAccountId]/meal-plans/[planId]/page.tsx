"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../../../../../lib/api";
import { ExtraNutrientTables } from "../../../../../lib/extra-nutrient-tables";
import { type ExtraNutrients } from "../../../../../lib/micronutrients";
import { errorMessage } from "../../../../../lib/humanize-error";
import { groupDaysByWeek, weekOfDay } from "../../../../../lib/meal-plan-weeks";
import { statusLabel, unitLabel } from "../../../../../lib/practice-labels";

interface Nutrition {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

interface FoodHit {
  id: string;
  name: string;
  origin?: "catalog" | "custom";
  servingDescription?: string | null;
  referenceQuantity?: number;
  referenceUnit?: string;
  hasOverride?: boolean;
}

interface RecipeHit {
  id: string;
  name: string;
  servings?: number;
}

interface Snapshot {
  days: Array<{
    id: string;
    dayNumber: number;
    weekday?: string | null;
    title: string | null;
    notes: string | null;
    presented: Nutrition;
    presentedExtraNutrients?: ExtraNutrients;
    meals: Array<{
      id: string;
      name: string;
      notes: string | null;
      presented: Nutrition;
      items: Array<{
        id: string;
        itemType: string;
        quantity: number;
        unit: string;
        notes: string | null;
        food: {
          id: string;
          name: string;
          origin?: "catalog" | "custom";
          servingDescription?: string | null;
        } | null;
        recipe: { id: string; name: string; servings?: number } | null;
        presented: Nutrition;
      }>;
    }>;
  }>;
}

interface PlanDetail {
  id: string;
  name: string;
  status: string;
  dayLabelMode: "NUMBERED" | "WEEKDAY";
  versions: Array<{ id: string; versionNumber: number; status: string }>;
}

interface VersionDetail {
  id: string;
  versionNumber: number;
  status: string;
  immutable: boolean;
  snapshot: Snapshot;
}

const MEAL_NAME_PRESETS = [
  "Breakfast",
  "Morning Snack",
  "Lunch",
  "Afternoon Snack",
  "Dinner",
  "Evening Snack",
] as const;

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;

function nutritionLine(n: Nutrition): string | undefined {
  const parts: string[] = [];
  if (n.energyKcal !== null && n.energyKcal !== 0) parts.push(`${n.energyKcal} kcal`);
  if (n.proteinG !== null && n.proteinG !== 0) parts.push(`P ${n.proteinG}g`);
  if (n.carbohydrateG !== null && n.carbohydrateG !== 0) parts.push(`C ${n.carbohydrateG}g`);
  if (n.fatG !== null && n.fatG !== 0) parts.push(`F ${n.fatG}g`);
  if (n.fiberG !== null && n.fiberG !== 0) parts.push(`Fiber ${n.fiberG}g`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function dayInWeek(dayNumber: number): number {
  return ((dayNumber - 1) % 7) + 1;
}

function dayWeek(dayNumber: number): number {
  return Math.floor((dayNumber - 1) / 7) + 1;
}

function dayTabLabel(day: { title: string | null; weekday?: string | null; dayNumber: number }): string {
  if (day.weekday) return day.weekday;
  if (day.title) return day.title;
  return `Day ${dayInWeek(day.dayNumber)}`;
}

function dayFullLabel(day: { title: string | null; weekday?: string | null; dayNumber: number }): string {
  if (day.title) return day.title;
  if (day.weekday) return `Week ${dayWeek(day.dayNumber)} · ${day.weekday}`;
  return `Week ${dayWeek(day.dayNumber)} · Day ${dayInWeek(day.dayNumber)}`;
}

export default function MealPlanEditorPage() {
  const params = useParams<{ dietitianAccountId: string; planId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { dietitianAccountId, planId } = params;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [activeDayId, setActiveDayId] = useState<string>("");
  const [activeWeek, setActiveWeek] = useState(1);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [foodHits, setFoodHits] = useState<FoodHit[]>([]);
  const [recipeHits, setRecipeHits] = useState<RecipeHit[]>([]);
  const [quantity, setQuantity] = useState("100");
  const [recipeServings, setRecipeServings] = useState("1");
  const [unit, setUnit] = useState("g");
  const [servingHint, setServingHint] = useState<string | null>(null);
  const [newMealName, setNewMealName] = useState("Breakfast");
  const [customMealName, setCustomMealName] = useState("");
  const [renameMealId, setRenameMealId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const versionId = useMemo(() => {
    if (search.get("versionId")) return search.get("versionId");
    const draft = plan?.versions.find((row) => row.status === "DRAFT");
    const published = plan?.versions.find((row) => row.status === "PUBLISHED");
    return draft?.id ?? published?.id ?? plan?.versions[0]?.id;
  }, [search, plan]);

  async function load(nextVersionId?: string) {
    const detail = await api<PlanDetail>(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}`);
    setPlan(detail);
    const selected =
      nextVersionId ??
      versionId ??
      detail.versions.find((row) => row.status === "DRAFT")?.id ??
      detail.versions[0]?.id;
    if (!selected) return;
    const loaded = await api<VersionDetail>(
      `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${selected}`,
    );
    setVersion(loaded);
    setError(null);
    const first = loaded.snapshot.days[0];
    if (!activeDayId && first) {
      setActiveDayId(first.id);
      setActiveWeek(weekOfDay(first.dayNumber));
    } else if (activeDayId) {
      const still = loaded.snapshot.days.find((d) => d.id === activeDayId);
      if (still) setActiveWeek(weekOfDay(still.dayNumber));
      else if (first) {
        setActiveDayId(first.id);
        setActiveWeek(weekOfDay(first.dayNumber));
      }
    }
  }

  function applyVersion(loaded: VersionDetail) {
    setVersion(loaded);
    setError(null);
    const first = loaded.snapshot.days[0];
    if (!activeDayId && first) {
      setActiveDayId(first.id);
      setActiveWeek(weekOfDay(first.dayNumber));
    } else if (activeDayId) {
      const still = loaded.snapshot.days.find((d) => d.id === activeDayId);
      if (still) setActiveWeek(weekOfDay(still.dayNumber));
      else if (first) {
        setActiveDayId(first.id);
        setActiveWeek(weekOfDay(first.dayNumber));
      }
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load plan")));
  }, [dietitianAccountId, planId, versionId]);

  const day =
    version?.snapshot.days.find((d) => d.id === activeDayId) ?? version?.snapshot.days[0];
  const canEdit = version?.status === "DRAFT" && !version.immutable;

  async function publish() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/publish`, {
        method: "POST",
      });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Publish failed"));
    } finally {
      setBusy(false);
    }
  }

  async function newDraft() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<VersionDetail>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions`,
        { method: "POST" },
      );
      window.location.href = `/practice/${dietitianAccountId}/meal-plans/${planId}?versionId=${created.id}`;
    } catch (err) {
      setError(errorMessage(err, "Could not create draft"));
      setBusy(false);
    }
  }

  async function addDay() {
    if (!version) return;
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/days`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not add day"));
    }
  }

  async function addWeek() {
    if (!version) return;
    setError(null);
    setBusy(true);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/weeks`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not add week"));
    } finally {
      setBusy(false);
    }
  }

  async function setDayLabelMode(mode: "NUMBERED" | "WEEKDAY") {
    if (!plan || plan.dayLabelMode === mode) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<PlanDetail>(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify({ dayLabelMode: mode }),
      });
      setPlan(updated);
      if (version) await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not update day labels"));
    } finally {
      setBusy(false);
    }
  }

  async function createMeal(event: FormEvent) {
    event.preventDefault();
    if (!version || !day) return;
    const name = newMealName === "Custom" ? customMealName.trim() : newMealName;
    if (!name) {
      setError("Meal name is required");
      return;
    }
    setError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/days/${day.id}/meals`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      setCustomMealName("");
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not create meal"));
    }
  }

  async function saveRename(mealId: string) {
    if (!version || !renameValue.trim()) return;
    setError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}`,
        { method: "PATCH", body: JSON.stringify({ name: renameValue.trim() }) },
      );
      setRenameMealId(null);
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not rename meal"));
    }
  }

  async function deleteMeal(mealId: string) {
    if (!version) return;
    setError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}`,
        { method: "DELETE" },
      );
      if (editingMealId === mealId) setEditingMealId(null);
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete meal"));
    }
  }

  async function removeItem(itemId: string) {
    if (!version) return;
    setError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/items/${itemId}`,
        { method: "DELETE" },
      );
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not remove item"));
    }
  }

  async function updateItemQuantity(itemId: string, quantityValue: number, unitValue: string) {
    if (!version) return;
    setError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/items/${itemId}`,
        { method: "PATCH", body: JSON.stringify({ quantity: quantityValue, unit: unitValue }) },
      );
      setQtyDrafts((curr) => {
        const next = { ...curr };
        delete next[itemId];
        return next;
      });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not update quantity"));
    }
  }

  async function searchFoods() {
    setError(null);
    try {
      const result = await api<{ items: FoodHit[] }>(
        `/api/v1/dietitian/${dietitianAccountId}/foods?q=${encodeURIComponent(foodQuery)}&pageSize=8`,
      );
      setFoodHits(result.items);
    } catch (err) {
      setError(errorMessage(err, "Food search failed"));
    }
  }

  async function searchRecipes() {
    setError(null);
    try {
      const result = await api<{ items: RecipeHit[] }>(
        `/api/v1/dietitian/${dietitianAccountId}/recipes?q=${encodeURIComponent(recipeQuery)}&pageSize=8`,
      );
      setRecipeHits(result.items);
    } catch (err) {
      setError(errorMessage(err, "Recipe search failed"));
    }
  }

  async function addFood(mealId: string, hit: FoodHit) {
    if (!version) return;
    setError(null);
    const qty = hit.referenceQuantity ?? Number(quantity);
    const u = hit.referenceUnit ?? unit;
    try {
      const loaded = await api<VersionDetail>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
        {
          method: "POST",
          body: JSON.stringify({ itemType: "FOOD", foodId: hit.id, quantity: qty, unit: u }),
        },
      );
      setFoodHits([]);
      setFoodQuery("");
      setServingHint(null);
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not add food"));
    }
  }

  async function addRecipe(mealId: string, recipeId: string) {
    if (!version) return;
    setError(null);
    try {
      const loaded = await api<VersionDetail>(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
        {
          method: "POST",
          body: JSON.stringify({
            itemType: "RECIPE",
            recipeId,
            quantity: Number(recipeServings),
            unit: "serving",
          }),
        },
      );
      setRecipeHits([]);
      setRecipeQuery("");
      applyVersion(loaded);
    } catch (err) {
      setError(errorMessage(err, "Could not add recipe"));
    }
  }

  async function archivePlan() {
    if (!plan) return;
    if (!window.confirm(`Delete meal plan “${plan.name}”? It will be archived.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/archive`, { method: "POST" });
      router.push(`/practice/${dietitianAccountId}/meal-plans`);
    } catch (err) {
      setError(errorMessage(err, "Could not delete plan"));
      setBusy(false);
    }
  }

  async function deleteDay() {
    if (!version) return;
    const target =
      version.snapshot.days.find((d) => d.id === activeDayId) ?? version.snapshot.days[0];
    if (!target) return;
    if (!window.confirm(`Remove ${dayFullLabel(target)} from this draft?`)) return;
    setError(null);
    try {
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/days/${target.id}`,
        { method: "DELETE" },
      );
      setActiveDayId("");
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete day"));
    }
  }

  if (!plan || !version) {
    return (
      <section>
        {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading plan…</LoadingState>}
      </section>
    );
  }

  const weekGroups = groupDaysByWeek(version.snapshot.days);
  const currentWeek = weekGroups.some((g) => g.week === activeWeek)
    ? activeWeek
    : (weekGroups[0]?.week ?? 1);
  const weekDays = weekGroups.find((g) => g.week === currentWeek)?.days ?? [];
  const dayTabs = weekDays.map((d) => ({
    id: d.id,
    label: dayTabLabel(d),
  }));
  const focusedDay =
    weekDays.find((d) => d.id === activeDayId) ?? weekDays[0] ?? null;
  const hasMultipleVersions = plan.versions.length > 1;

  return (
    <section className="ui-meal-editor">
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/meal-plans`, label: "Meal plans" },
          { label: plan.name },
        ]}
      />

      <header className="ui-meal-editor__header">
        <div className="ui-meal-editor__title-block">
          <h1 className="ui-meal-editor__title">{plan.name}</h1>
          <p className="ui-meal-editor__meta">
            <span>
              v{version.versionNumber} · {version.immutable ? "Published" : "Draft"}
            </span>
            <StatusBadge status={plan.status} label={statusLabel(plan.status)} />
          </p>
        </div>
        <div className="ui-meal-editor__actions">
          <Link
            href={`/practice/${dietitianAccountId}/meal-plans`}
            className="ui-btn ui-btn--ghost ui-btn--sm"
          >
            Back
          </Link>
          {canEdit ? (
            <Button size="sm" onClick={() => void publish()} disabled={busy}>
              Publish
            </Button>
          ) : (
            <Button size="sm" onClick={() => void newDraft()} disabled={busy}>
              New draft
            </Button>
          )}
        </div>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="ui-meal-editor__nav">
        {weekGroups.length > 0 ? (
          <div className="ui-meal-editor__nav-row">
            <div className="ui-meal-editor__chips" role="tablist" aria-label="Weeks">
              {weekGroups.map((group) => (
                <button
                  key={group.week}
                  type="button"
                  className={
                    group.week === currentWeek ? "ui-meal-editor__chip is-active" : "ui-meal-editor__chip"
                  }
                  onClick={() => {
                    setActiveWeek(group.week);
                    const first = group.days[0];
                    if (first) setActiveDayId(first.id);
                  }}
                >
                  Week {group.week}
                </button>
              ))}
            </div>
            {canEdit ? (
              <div className="ui-meal-editor__nav-tools">
                <Button size="sm" variant="ghost" onClick={() => void addDay()} disabled={busy}>
                  + Day
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void addWeek()} disabled={busy}>
                  + Week
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {dayTabs.length > 0 ? (
          <Tabs
            items={dayTabs}
            value={focusedDay?.id ?? ""}
            onChange={(id) => {
              setActiveDayId(id);
              const selected = version.snapshot.days.find((d) => d.id === id);
              if (selected) setActiveWeek(weekOfDay(selected.dayNumber));
              setEditingMealId(null);
              setFoodHits([]);
              setRecipeHits([]);
              setRenameMealId(null);
            }}
          />
        ) : null}

        {hasMultipleVersions || canEdit || plan.status !== "ARCHIVED" ? (
          <details className="ui-meal-editor__more">
            <summary>Plan settings</summary>
            <div className="ui-meal-editor__more-body">
              {hasMultipleVersions ? (
                <div className="ui-meal-editor__tool">
                  <span>Versions</span>
                  <div className="ui-meal-editor__chips">
                    {plan.versions.map((row) => (
                      <a
                        key={row.id}
                        href={`/practice/${dietitianAccountId}/meal-plans/${planId}?versionId=${row.id}`}
                        className={
                          row.id === version.id ? "ui-meal-editor__chip is-active" : "ui-meal-editor__chip"
                        }
                      >
                        v{row.versionNumber} · {statusLabel(row.status)}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {canEdit || plan.status !== "ARCHIVED" ? (
                <label className="ui-meal-editor__tool">
                  <span>Day labels</span>
                  <Select
                    value={plan.dayLabelMode ?? "NUMBERED"}
                    disabled={busy || plan.status === "ARCHIVED"}
                    onChange={(event) =>
                      void setDayLabelMode(event.target.value as "NUMBERED" | "WEEKDAY")
                    }
                  >
                    <option value="NUMBERED">Week N · Day 1–7</option>
                    <option value="WEEKDAY">Weekdays</option>
                  </Select>
                </label>
              ) : null}
              {plan.status !== "ARCHIVED" ? (
                <button
                  type="button"
                  className="ui-meal-editor__danger-link"
                  disabled={busy}
                  onClick={() => void archivePlan()}
                >
                  Delete plan…
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>

      {dayTabs.length > 0 ? (
        focusedDay ? (
          <div className="ui-meal-editor__day">
            <div className="ui-meal-editor__day-head">
              <div>
                <h2 className="ui-meal-editor__day-title">{dayFullLabel(focusedDay)}</h2>
                {nutritionLine(focusedDay.presented) ? (
                  <p className="ui-meal-editor__day-nutrition">{nutritionLine(focusedDay.presented)}</p>
                ) : (
                  <p className="ui-meal-editor__day-nutrition is-empty">No foods yet</p>
                )}
              </div>
              {canEdit && version.snapshot.days.length > 1 ? (
                <button
                  type="button"
                  className="ui-meal-editor__danger-link"
                  onClick={() => void deleteDay()}
                >
                  Remove day
                </button>
              ) : null}
            </div>

            {focusedDay.presentedExtraNutrients ? (
              <details className="ui-meal-editor__micros">
                <summary>Micronutrients</summary>
                <ExtraNutrientTables
                  values={focusedDay.presentedExtraNutrients}
                  caption="day total"
                  emptyMessage="No micronutrient data for this day’s foods yet."
                />
              </details>
            ) : null}

            {canEdit ? (
              <form onSubmit={(event) => void createMeal(event)} className="ui-meal-editor__add-meal">
                <Select
                  value={newMealName}
                  onChange={(e) => setNewMealName(e.target.value)}
                  aria-label="Meal type"
                >
                  {MEAL_NAME_PRESETS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="Custom">Custom…</option>
                </Select>
                {newMealName === "Custom" ? (
                  <Input
                    value={customMealName}
                    onChange={(e) => setCustomMealName(e.target.value)}
                    placeholder="Meal name…"
                    required
                    aria-label="Custom meal name"
                  />
                ) : null}
                <Button type="submit" size="sm" variant="secondary">
                  Add meal
                </Button>
              </form>
            ) : null}

            {focusedDay.meals.length === 0 ? (
              <EmptyState title="No meals yet">
                {canEdit ? "Add a meal above, then add foods or recipes." : "This day has no meals."}
              </EmptyState>
            ) : (
              <div className="ui-meal-editor__meals">
                {focusedDay.meals.map((meal) => (
                  <article key={meal.id} className="ui-meal-editor__meal">
                    <div className="ui-meal-editor__meal-head">
                      <div className="ui-meal-editor__meal-title-block">
                        {renameMealId === meal.id ? (
                          <div className="ui-meal-editor__rename">
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              aria-label="Meal name"
                            />
                            <Button size="sm" onClick={() => void saveRename(meal.id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenameMealId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h3 className="ui-meal-editor__meal-title">{meal.name}</h3>
                            <p className="ui-meal-editor__meal-meta">
                              {nutritionLine(meal.presented) ?? "Empty"}
                            </p>
                          </>
                        )}
                      </div>
                      {canEdit && renameMealId !== meal.id ? (
                        <div className="ui-meal-editor__meal-actions">
                          <Button
                            variant={editingMealId === meal.id ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => {
                              setEditingMealId(editingMealId === meal.id ? null : meal.id);
                              setFoodHits([]);
                              setRecipeHits([]);
                              setFoodQuery("");
                              setRecipeQuery("");
                              setServingHint(null);
                            }}
                          >
                            {editingMealId === meal.id ? "Done" : "Add foods"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRenameMealId(meal.id);
                              setRenameValue(meal.name);
                            }}
                          >
                            Rename
                          </Button>
                          <button
                            type="button"
                            className="ui-meal-editor__danger-link"
                            onClick={() => void deleteMeal(meal.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {meal.items.length > 0 ? (
                      <Table>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Amount</th>
                            <th>Nutrition</th>
                            {canEdit ? <th></th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {meal.items.map((item) => {
                            const draftQty = qtyDrafts[item.id] ?? String(item.quantity);
                            return (
                              <tr key={item.id}>
                                <Td label="Item">
                                  <div className="ui-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                    <span>{item.food?.name ?? item.recipe?.name ?? "—"}</span>
                                    {item.itemType === "RECIPE" ? (
                                      <Badge tone="accent">Recipe</Badge>
                                    ) : item.food?.origin === "custom" ? (
                                      <Badge tone="accent">Custom</Badge>
                                    ) : null}
                                  </div>
                                  {item.food?.servingDescription ? (
                                    <div className="ui-muted" style={{ fontSize: 12 }}>
                                      {item.food.servingDescription}
                                    </div>
                                  ) : null}
                                </Td>
                                <Td label="Amount">
                                  {canEdit ? (
                                    <div className="ui-row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                      <Input
                                        value={draftQty}
                                        style={{ width: 80 }}
                                        onChange={(e) =>
                                          setQtyDrafts((curr) => ({ ...curr, [item.id]: e.target.value }))
                                        }
                                      />
                                      <span className="ui-muted" style={{ fontSize: 13 }}>
                                        {unitLabel(item.unit)}
                                      </span>
                                      {draftQty !== String(item.quantity) ? (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() =>
                                            void updateItemQuantity(item.id, Number(draftQty), item.unit)
                                          }
                                        >
                                          Update
                                        </Button>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <>
                                      {item.quantity} {unitLabel(item.unit)}
                                    </>
                                  )}
                                </Td>
                                <Td label="Nutrition">{nutritionLine(item.presented) ?? "—"}</Td>
                                {canEdit ? (
                                  <Td label="">
                                    <button
                                      type="button"
                                      className="ui-meal-editor__danger-link"
                                      onClick={() => void removeItem(item.id)}
                                    >
                                      Remove
                                    </button>
                                  </Td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    ) : (
                      <p className="ui-muted ui-meal-editor__empty-hint">
                        No items yet. Use Add foods to search the catalog or meal library.
                      </p>
                    )}

                    {canEdit && editingMealId === meal.id ? (
                      <div className="ui-meal-editor__picker">
                        <div className="ui-meal-editor__picker-block">
                          <p className="ui-meal-editor__picker-label">Food</p>
                          <div className="ui-inline-form">
                            <Field label="Search">
                              <Input
                                value={foodQuery}
                                onChange={(e) => setFoodQuery(e.target.value)}
                                placeholder="Catalog or custom…"
                              />
                            </Field>
                            <Field label="Amount">
                              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                            </Field>
                            <Field label="Unit">
                              <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                                {UNITS.map((u) => (
                                  <option key={u} value={u}>
                                    {unitLabel(u)}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <div className="ui-inline-form__action">
                              <Button variant="secondary" size="sm" onClick={() => void searchFoods()}>
                                Search
                              </Button>
                            </div>
                          </div>
                          {servingHint ? (
                            <p className="ui-muted" style={{ marginTop: 8, fontSize: 13 }}>
                              {servingHint}
                            </p>
                          ) : null}
                          {foodHits.length > 0 ? (
                            <div className="ui-stack" style={{ marginTop: 8, gap: 6 }}>
                              {foodHits.map((hit) => (
                                <div
                                  key={hit.id}
                                  className="ui-row"
                                  style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}
                                >
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      if (hit.referenceQuantity != null) {
                                        setQuantity(String(hit.referenceQuantity));
                                      }
                                      if (hit.referenceUnit) setUnit(hit.referenceUnit);
                                      setServingHint(hit.servingDescription ?? null);
                                      void addFood(meal.id, hit);
                                    }}
                                  >
                                    + {hit.name}
                                  </Button>
                                  {hit.origin === "custom" ? <Badge tone="accent">Custom</Badge> : null}
                                  {hit.hasOverride ? <Badge tone="warning">Overridden</Badge> : null}
                                  {hit.servingDescription ? (
                                    <span className="ui-muted" style={{ fontSize: 12 }}>
                                      {hit.servingDescription}
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="ui-meal-editor__picker-block">
                          <p className="ui-meal-editor__picker-label">Recipe</p>
                          <div className="ui-inline-form">
                            <Field label="Search">
                              <Input
                                value={recipeQuery}
                                onChange={(e) => setRecipeQuery(e.target.value)}
                                placeholder="Meal library…"
                              />
                            </Field>
                            <Field label="Servings">
                              <Input
                                value={recipeServings}
                                onChange={(e) => setRecipeServings(e.target.value)}
                              />
                            </Field>
                            <div className="ui-inline-form__action">
                              <Button variant="secondary" size="sm" onClick={() => void searchRecipes()}>
                                Search
                              </Button>
                            </div>
                          </div>
                          {recipeHits.length > 0 ? (
                            <div className="ui-row" style={{ marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                              {recipeHits.map((hit) => (
                                <Button
                                  key={hit.id}
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void addRecipe(meal.id, hit.id)}
                                >
                                  + {hit.name}
                                  {hit.servings != null ? ` (${hit.servings} srv)` : ""}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null
      ) : (
        <EmptyState title="No days yet">
          {canEdit ? (
            <Button onClick={() => void addDay()}>Add first day</Button>
          ) : (
            "This version has no days."
          )}
        </EmptyState>
      )}
    </section>
  );
}
