"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Alert,
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
import { errorMessage } from "../../../../../lib/humanize-error";
import { statusLabel, unitLabel } from "../../../../../lib/practice-labels";

interface Nutrition {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

interface Snapshot {
  days: Array<{
    id: string;
    dayNumber: number;
    title: string | null;
    notes: string | null;
    presented: Nutrition;
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
        food: { id: string; name: string } | null;
        recipe: { id: string; name: string } | null;
        presented: Nutrition;
      }>;
    }>;
  }>;
}

interface PlanDetail {
  id: string;
  name: string;
  status: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
}

interface VersionDetail {
  id: string;
  versionNumber: number;
  status: string;
  immutable: boolean;
  snapshot: Snapshot;
}

function nutritionLine(n: Nutrition): string | undefined {
  const parts: string[] = [];
  if (n.energyKcal !== null) parts.push(`${n.energyKcal} kcal`);
  if (n.proteinG !== null) parts.push(`P ${n.proteinG}g`);
  if (n.carbohydrateG !== null) parts.push(`C ${n.carbohydrateG}g`);
  if (n.fatG !== null) parts.push(`F ${n.fatG}g`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;

export default function MealPlanEditorPage() {
  const params = useParams<{ organizationId: string; planId: string }>();
  const search = useSearchParams();
  const { organizationId, planId } = params;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [activeDayId, setActiveDayId] = useState<string>("");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [foodQuery, setFoodQuery] = useState("");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [foodHits, setFoodHits] = useState<Array<{ id: string; name: string }>>([]);
  const [recipeHits, setRecipeHits] = useState<Array<{ id: string; name: string }>>([]);
  const [quantity, setQuantity] = useState("100");
  const [recipeServings, setRecipeServings] = useState("1");
  const [unit, setUnit] = useState("g");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const versionId = useMemo(() => {
    if (search.get("versionId")) return search.get("versionId");
    const draft = plan?.versions.find((row) => row.status === "DRAFT");
    const published = plan?.versions.find((row) => row.status === "PUBLISHED");
    return draft?.id ?? published?.id ?? plan?.versions[0]?.id;
  }, [search, plan]);

  async function load(nextVersionId?: string) {
    const detail = await api<PlanDetail>(`/api/v1/organizations/${organizationId}/meal-plans/${planId}`);
    setPlan(detail);
    const selected =
      nextVersionId ??
      versionId ??
      detail.versions.find((row) => row.status === "DRAFT")?.id ??
      detail.versions[0]?.id;
    if (!selected) return;
    const loaded = await api<VersionDetail>(
      `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${selected}`,
    );
    setVersion(loaded);
    if (!activeDayId && loaded.snapshot.days[0]) {
      setActiveDayId(loaded.snapshot.days[0].id);
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load plan")));
  }, [organizationId, planId, versionId]);

  const day =
    version?.snapshot.days.find((d) => d.id === activeDayId) ?? version?.snapshot.days[0];
  const canEdit = version?.status === "DRAFT" && !version.immutable;

  async function publish() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/publish`, {
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
        `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions`,
        { method: "POST" },
      );
      window.location.href = `/practice/${organizationId}/meal-plans/${planId}?versionId=${created.id}`;
    } catch (err) {
      setError(errorMessage(err, "Could not create draft"));
      setBusy(false);
    }
  }

  async function addDay() {
    if (!version) return;
    setError(null);
    try {
      await api(`/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/days`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not add day"));
    }
  }

  async function removeItem(itemId: string) {
    if (!version) return;
    setError(null);
    try {
      await api(
        `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/items/${itemId}`,
        { method: "DELETE" },
      );
      await load(version.id);
    } catch (err) {
      setError(errorMessage(err, "Could not remove item"));
    }
  }

  async function searchFoods() {
    setError(null);
    try {
      const result = await api<{ items: Array<{ id: string; name: string }> }>(
        `/api/v1/organizations/${organizationId}/foods?q=${encodeURIComponent(foodQuery)}&pageSize=5`,
      );
      setFoodHits(result.items);
    } catch (err) {
      setError(errorMessage(err, "Food search failed"));
    }
  }

  async function searchRecipes() {
    setError(null);
    try {
      const result = await api<{ items: Array<{ id: string; name: string }> }>(
        `/api/v1/organizations/${organizationId}/recipes?q=${encodeURIComponent(recipeQuery)}&pageSize=5`,
      );
      setRecipeHits(result.items);
    } catch (err) {
      setError(errorMessage(err, "Recipe search failed"));
    }
  }

  async function addFood(mealId: string, foodId: string) {
    if (!version) return;
    setError(null);
    try {
      await api(
        `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
        { method: "POST", body: JSON.stringify({ itemType: "FOOD", foodId, quantity: Number(quantity), unit }) },
      );
      setFoodHits([]);
      setFoodQuery("");
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
        `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
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

  if (!plan || !version) {
    return (
      <section>
        {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading plan…</LoadingState>}
      </section>
    );
  }

  const dayTabs = version.snapshot.days.map((d) => ({
    id: d.id,
    label: d.title ?? `Day ${d.dayNumber}`,
  }));

  return (
    <section>
      <Breadcrumbs
        items={[
          { href: `/practice/${organizationId}/meal-plans`, label: "Meal plans" },
          { label: plan.name },
        ]}
      />

      <PageHeader
        title={plan.name}
        description={`Version ${version.versionNumber} · ${version.immutable ? "Immutable snapshot" : "Live effective foods"}`}
        actions={
          canEdit ? (
            <>
              <Button onClick={() => void publish()} disabled={busy}>
                Publish
              </Button>
              <Button variant="secondary" onClick={() => void addDay()} disabled={busy}>
                Add day
              </Button>
            </>
          ) : (
            <Button onClick={() => void newDraft()} disabled={busy}>
              New draft from this version
            </Button>
          )
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Version selector */}
      <div className="ui-row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {plan.versions.map((row) => (
          <a
            key={row.id}
            href={`/practice/${organizationId}/meal-plans/${planId}?versionId=${row.id}`}
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

      {/* Day tabs + content */}
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
            }}
          />

          {day ? (
            <div style={{ marginTop: 16 }}>
              {nutritionLine(day.presented) ? (
                <p className="ui-muted" style={{ marginBottom: 12, fontSize: 13 }}>
                  {nutritionLine(day.presented)}
                </p>
              ) : null}

              {day.meals.length === 0 ? (
                <EmptyState title="No meals in this day">
                  Meals are configured as part of the plan structure.
                </EmptyState>
              ) : (
                day.meals.map((meal) => (
                  <Section
                    key={meal.id}
                    title={meal.name}
                    description={nutritionLine(meal.presented)}
                    actions={
                      canEdit ? (
                        editingMealId === meal.id ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingMealId(null);
                              setFoodHits([]);
                              setRecipeHits([]);
                            }}
                          >
                            Done
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingMealId(meal.id);
                              setFoodHits([]);
                              setRecipeHits([]);
                              setFoodQuery("");
                              setRecipeQuery("");
                            }}
                          >
                            Add ingredient
                          </Button>
                        )
                      ) : null
                    }
                  >
                    {meal.items.length > 0 ? (
                      <Table>
                        <thead>
                          <tr>
                            <th>Food / Recipe</th>
                            <th>Amount</th>
                            <th>Calories</th>
                            {canEdit ? <th></th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {meal.items.map((item) => (
                            <tr key={item.id}>
                              <Td label="Food / Recipe">
                                {item.food?.name ?? item.recipe?.name ?? "—"}
                                {item.itemType === "RECIPE" ? (
                                  <span
                                    className="ui-muted"
                                    style={{ marginLeft: 6, fontSize: 12 }}
                                  >
                                    recipe
                                  </span>
                                ) : null}
                              </Td>
                              <Td label="Amount">
                                {item.quantity} {unitLabel(item.unit)}
                              </Td>
                              <Td label="Calories">
                                {item.presented.energyKcal !== null
                                  ? `${item.presented.energyKcal} kcal`
                                  : "—"}
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
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <p className="ui-muted" style={{ margin: "8px 0" }}>
                        No items yet.
                      </p>
                    )}

                    {canEdit && editingMealId === meal.id ? (
                      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 20 }}>
                        {/* Add food */}
                        <div>
                          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                            Add food
                          </p>
                          <div className="ui-row" style={{ flexWrap: "wrap", alignItems: "end" }}>
                            <Field label="Search food">
                              <Input
                                value={foodQuery}
                                onChange={(e) => setFoodQuery(e.target.value)}
                                placeholder="Food name…"
                              />
                            </Field>
                            <Field label="Amount">
                              <Input
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                              />
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
                            <div>
                              <Button variant="secondary" onClick={() => void searchFoods()}>
                                Search
                              </Button>
                            </div>
                          </div>
                          {foodHits.length > 0 ? (
                            <div className="ui-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                              {foodHits.map((hit) => (
                                <Button
                                  key={hit.id}
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void addFood(meal.id, hit.id)}
                                >
                                  + {hit.name}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {/* Add recipe */}
                        <div>
                          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                            Add recipe
                          </p>
                          <div className="ui-row" style={{ flexWrap: "wrap", alignItems: "end" }}>
                            <Field label="Search recipe">
                              <Input
                                value={recipeQuery}
                                onChange={(e) => setRecipeQuery(e.target.value)}
                                placeholder="Recipe name…"
                              />
                            </Field>
                            <Field label="Servings">
                              <Input
                                value={recipeServings}
                                onChange={(e) => setRecipeServings(e.target.value)}
                              />
                            </Field>
                            <div>
                              <Button variant="secondary" onClick={() => void searchRecipes()}>
                                Search
                              </Button>
                            </div>
                          </div>
                          {recipeHits.length > 0 ? (
                            <div className="ui-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                              {recipeHits.map((hit) => (
                                <Button
                                  key={hit.id}
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void addRecipe(meal.id, hit.id)}
                                >
                                  + {hit.name}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </Section>
                ))
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
