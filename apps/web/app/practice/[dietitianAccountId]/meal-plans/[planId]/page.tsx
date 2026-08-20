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
  PageHeader,
  Section,
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
  if (n.energyKcal !== null) parts.push(`${n.energyKcal} kcal`);
  if (n.proteinG !== null) parts.push(`P ${n.proteinG}g`);
  if (n.carbohydrateG !== null) parts.push(`C ${n.carbohydrateG}g`);
  if (n.fatG !== null) parts.push(`F ${n.fatG}g`);
  if (n.fiberG !== null) parts.push(`Fiber ${n.fiberG}g`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function dayDisplayLabel(day: { title: string | null; weekday?: string | null; dayNumber: number }): string {
  return day.title ?? day.weekday ?? `Day ${day.dayNumber}`;
}

export default function MealPlanEditorPage() {
  const params = useParams<{ dietitianAccountId: string; planId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { dietitianAccountId, planId } = params;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [activeDayId, setActiveDayId] = useState<string>("");
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
    if (!activeDayId && loaded.snapshot.days[0]) {
      setActiveDayId(loaded.snapshot.days[0].id);
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
      await api(
        `/api/v1/dietitian/${dietitianAccountId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
        {
          method: "POST",
          body: JSON.stringify({ itemType: "FOOD", foodId: hit.id, quantity: qty, unit: u }),
        },
      );
      setFoodHits([]);
      setFoodQuery("");
      setServingHint(null);
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not add food"));
    }
  }

  async function addRecipe(mealId: string, recipeId: string) {
    if (!version) return;
    setError(null);
    try {
      await api(
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
      await load(version.id);
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
    if (!window.confirm(`Remove ${dayDisplayLabel(target)} from this draft?`)) return;
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

  const dayTabs = version.snapshot.days.map((d) => ({
    id: d.id,
    label: dayDisplayLabel(d),
  }));

  return (
    <section className="ui-stack" style={{ gap: 20 }}>
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/meal-plans`, label: "Meal plans" },
          { label: plan.name },
        ]}
      />

      <PageHeader
        title={plan.name}
        description={
          <>
            Version {version.versionNumber}
            {" · "}
            {version.immutable ? "Published snapshot (read-only)" : "Draft — live nutrition from foods & recipes"}
            {" · "}
            <StatusBadge status={plan.status} label={statusLabel(plan.status)} />
          </>
        }
        actions={
          <div className="ui-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Link href={`/practice/${dietitianAccountId}/meal-plans`} className="ui-btn ui-btn--secondary">
              Back
            </Link>
            {canEdit ? (
              <>
                <Button variant="secondary" onClick={() => void addDay()} disabled={busy}>
                  Add day
                </Button>
                <Button onClick={() => void publish()} disabled={busy}>
                  Publish
                </Button>
              </>
            ) : (
              <Button onClick={() => void newDraft()} disabled={busy}>
                New draft
              </Button>
            )}
            {plan.status !== "ARCHIVED" ? (
              <Button variant="danger" onClick={() => void archivePlan()} disabled={busy}>
                Delete plan
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section
        title="Day labels"
        tone="muted"
        description="Choose how days appear in this plan and for the client after publish. Switching updates draft day names."
      >
        <Field label="Show days as">
          <Select
            value={plan.dayLabelMode ?? "NUMBERED"}
            disabled={busy || plan.status === "ARCHIVED"}
            onChange={(event) => void setDayLabelMode(event.target.value as "NUMBERED" | "WEEKDAY")}
          >
            <option value="NUMBERED">Day 1, Day 2, Day 3…</option>
            <option value="WEEKDAY">Monday, Tuesday, Wednesday…</option>
          </Select>
        </Field>
      </Section>

      <Section title="Versions" tone="muted" description="Switch between draft and published snapshots.">
        <div className="ui-row" style={{ flexWrap: "wrap", gap: 8 }}>
          {plan.versions.map((row) => (
            <a
              key={row.id}
              href={`/practice/${dietitianAccountId}/meal-plans/${planId}?versionId=${row.id}`}
              style={{ textDecoration: "none" }}
            >
              <StatusBadge
                status={row.status}
                label={`v${row.versionNumber} · ${statusLabel(row.status)}`}
                tone={row.id === version.id ? undefined : "neutral"}
              />
            </a>
          ))}
        </div>
      </Section>

      {dayTabs.length > 0 ? (
        <>
          <Tabs
            items={dayTabs}
            value={day?.id ?? ""}
            onChange={(id) => {
              setActiveDayId(id);
              setEditingMealId(null);
              setFoodHits([]);
              setRecipeHits([]);
              setRenameMealId(null);
            }}
          />

          {day ? (
            <div className="ui-stack" style={{ marginTop: 16, gap: 20 }}>
              <Section
                title={dayDisplayLabel(day)}
                description="Daily total = sum of all meals (API)."
                actions={
                  canEdit && version.snapshot.days.length > 1 ? (
                    <Button variant="danger" size="sm" onClick={() => void deleteDay()}>
                      Delete day
                    </Button>
                  ) : null
                }
              >
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  {nutritionLine(day.presented) ??
                    "No items yet — totals appear when you add foods or recipes."}
                </p>
                {day.presentedExtraNutrients ? (
                  <div style={{ marginTop: 12 }}>
                    <ExtraNutrientTables
                      values={day.presentedExtraNutrients}
                      caption="day total"
                      emptyMessage="No micronutrient data for this day’s foods yet."
                    />
                  </div>
                ) : null}
              </Section>

              {canEdit ? (
                <Section title="Add a meal" tone="muted" description="Slots like Breakfast, Lunch, or a custom name.">
                  <form onSubmit={(event) => void createMeal(event)} className="ui-inline-form">
                    <Field label="Meal type">
                      <Select value={newMealName} onChange={(e) => setNewMealName(e.target.value)}>
                        {MEAL_NAME_PRESETS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value="Custom">Custom…</option>
                      </Select>
                    </Field>
                    {newMealName === "Custom" ? (
                      <Field label="Custom name">
                        <Input
                          value={customMealName}
                          onChange={(e) => setCustomMealName(e.target.value)}
                          placeholder="Meal name…"
                          required
                        />
                      </Field>
                    ) : null}
                    <div className="ui-inline-form__action">
                      <Button type="submit">Create meal</Button>
                    </div>
                  </form>
                </Section>
              ) : null}

              {day.meals.length === 0 ? (
                <EmptyState title="No meals in this day">
                  {canEdit
                    ? "Create a meal, then add foods and reusable recipes."
                    : "This day has no meals."}
                </EmptyState>
              ) : (
                <div className="ui-stack" style={{ gap: 16 }}>
                  {day.meals.map((meal, mealIndex) => (
                  <Section
                    key={meal.id}
                    tone={mealIndex % 2 === 0 ? "plain" : "muted"}
                    title={meal.name}
                    description={nutritionLine(meal.presented) ?? "Empty — add foods or a reusable meal"}
                    actions={
                      canEdit ? (
                        <div className="ui-row" style={{ gap: 8, flexWrap: "wrap" }}>
                          {renameMealId === meal.id ? (
                            <>
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                style={{ width: 140 }}
                              />
                              <Button size="sm" onClick={() => void saveRename(meal.id)}>
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setRenameMealId(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setRenameMealId(meal.id);
                                  setRenameValue(meal.name);
                                }}
                              >
                                Rename
                              </Button>
                              <Button
                                variant="secondary"
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
                                {editingMealId === meal.id ? "Done" : "Add items"}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void deleteMeal(meal.id)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      ) : null
                    }
                  >
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
                                    ) : (
                                      <Badge tone="neutral">Catalog</Badge>
                                    )}
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
                                <Td label="Nutrition">
                                  {nutritionLine(item.presented) ?? "—"}
                                </Td>
                                {canEdit ? (
                                  <Td label="">
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => void removeItem(item.id)}
                                    >
                                      Remove
                                    </Button>
                                  </Td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    ) : (
                      <p className="ui-muted" style={{ margin: "8px 0" }}>
                        No items yet. Add catalog/custom foods or a reusable recipe.
                      </p>
                    )}

                    {canEdit && editingMealId === meal.id ? (
                      <div
                        style={{
                          marginTop: 16,
                          paddingTop: 16,
                          borderTop: "1px solid var(--border, #e5e7eb)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 20,
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Add food</p>
                          <div className="ui-inline-form">
                            <Field label="Search food">
                              <Input
                                value={foodQuery}
                                onChange={(e) => setFoodQuery(e.target.value)}
                                placeholder="Catalog or custom food…"
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
                              <Button variant="secondary" onClick={() => void searchFoods()}>
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
                                  {hit.origin === "custom" ? (
                                    <Badge tone="accent">Custom</Badge>
                                  ) : (
                                    <Badge tone="neutral">Catalog</Badge>
                                  )}
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

                        <div>
                          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                            Add reusable recipe
                          </p>
                          <div className="ui-inline-form">
                            <Field label="Search recipe">
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
                              <Button variant="secondary" onClick={() => void searchRecipes()}>
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
                                  {hit.servings != null ? ` (${hit.servings} srv recipe)` : ""}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </Section>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
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
