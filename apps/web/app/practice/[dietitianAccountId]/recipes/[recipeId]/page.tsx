"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  StatusBadge,
  Table,
  Td,
  Textarea,
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

interface FoodHit {
  id: string;
  name: string;
  origin?: "catalog" | "custom";
  servingDescription?: string | null;
  referenceQuantity?: number;
  referenceUnit?: string;
  hasOverride?: boolean;
}

interface RecipeDetail {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  servings: number;
  status: string;
  nutrition: {
    presentedTotal: Nutrition;
    presentedPerServing: Nutrition;
    ingredients: Array<{
      foodId: string;
      foodName: string;
      quantity: number;
      unit: string;
      displayNote: string | null;
      presented: Nutrition;
    }>;
  };
}

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default function RecipeDetailPage() {
  const params = useParams<{ dietitianAccountId: string; recipeId: string }>();
  const { dietitianAccountId, recipeId } = params;
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodHits, setFoodHits] = useState<FoodHit[]>([]);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [servingHint, setServingHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  async function load() {
    const detail = await api<RecipeDetail>(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}`);
    setRecipe(detail);
    setName(detail.name);
    setServings(String(detail.servings));
    setDescription(detail.description ?? "");
    setInstructions(detail.instructions ?? "");
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load recipe")));
  }, [dietitianAccountId, recipeId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaveBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, servings: Number(servings), description, instructions }),
      });
      setNotice("Recipe saved.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not save recipe"));
    } finally {
      setSaveBusy(false);
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

  async function addFood(hit: FoodHit) {
    if (!recipe) return;
    setError(null);
    const qty = hit.referenceQuantity ?? Number(quantity);
    const u = hit.referenceUnit ?? unit;
    const ingredients = recipe.nutrition.ingredients.map((row) => ({
      foodId: row.foodId,
      quantity: row.quantity,
      unit: row.unit,
      displayNote: row.displayNote,
    }));
    ingredients.push({ foodId: hit.id, quantity: qty, unit: u, displayNote: null });
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}/ingredients`, {
        method: "PUT",
        body: JSON.stringify({ ingredients }),
      });
      setFoodHits([]);
      setFoodQuery("");
      setServingHint(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not add ingredient"));
    }
  }

  async function removeIngredient(index: number) {
    if (!recipe) return;
    setError(null);
    const ingredients = recipe.nutrition.ingredients
      .filter((_, i) => i !== index)
      .map((row) => ({ foodId: row.foodId, quantity: row.quantity, unit: row.unit, displayNote: row.displayNote }));
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}/ingredients`, {
        method: "PUT",
        body: JSON.stringify({ ingredients }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not remove ingredient"));
    }
  }

  if (!recipe) {
    return (
      <section>
        {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading recipe…</LoadingState>}
      </section>
    );
  }

  const total = recipe.nutrition.presentedTotal;
  const perServing = recipe.nutrition.presentedPerServing;
  const hasNutrition =
    total.energyKcal !== null ||
    total.proteinG !== null ||
    total.carbohydrateG !== null ||
    total.fatG !== null;

  return (
    <section>
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/recipes`, label: "Meal library" },
          { label: recipe.name },
        ]}
      />

      <PageHeader
        title={recipe.name}
        description={`Reusable meal · ${recipe.servings} serving${recipe.servings !== 1 ? "s" : ""} · live totals from API`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                void api<{ id: string }>(
                  `/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}/duplicate`,
                  { method: "POST" },
                ).then((copy) => {
                  window.location.href = `/practice/${dietitianAccountId}/recipes/${copy.id}`;
                })
              }
            >
              Duplicate
            </Button>
            {recipe.status === "ACTIVE" ? (
              <Button
                variant="danger"
                onClick={() =>
                  void api(
                    `/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}/archive`,
                    { method: "POST" },
                  ).then(() => load())
                }
              >
                Archive
              </Button>
            ) : (
              <StatusBadge status={recipe.status} label={statusLabel(recipe.status)} />
            )}
          </>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {/* Nutrition summary */}
      {hasNutrition ? (
        <div className="ui-row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
          <div className="ui-stat">
            <div className="ui-stat__label">Total calories</div>
            <div className="ui-stat__value">{fmt(total.energyKcal)} kcal</div>
          </div>
          <div className="ui-stat">
            <div className="ui-stat__label">Per serving</div>
            <div className="ui-stat__value">{fmt(perServing.energyKcal)} kcal</div>
          </div>
          {total.proteinG !== null ? (
            <div className="ui-stat">
              <div className="ui-stat__label">Protein / serving</div>
              <div className="ui-stat__value">{fmt(perServing.proteinG)}g</div>
            </div>
          ) : null}
          {total.carbohydrateG !== null ? (
            <div className="ui-stat">
              <div className="ui-stat__label">Carbs / serving</div>
              <div className="ui-stat__value">{fmt(perServing.carbohydrateG)}g</div>
            </div>
          ) : null}
          {total.fatG !== null ? (
            <div className="ui-stat">
              <div className="ui-stat__label">Fat / serving</div>
              <div className="ui-stat__value">{fmt(perServing.fatG)}g</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Details form */}
      <Section title="Details">
        <form
          onSubmit={(event) => void save(event)}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Field label="Recipe name">
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Servings" hint="Used to calculate per-serving nutrition.">
            <Input
              value={servings}
              type="number"
              min="1"
              step="1"
              onChange={(event) => setServings(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief description visible to clients…"
            />
          </Field>
          <Field label="Instructions">
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Step-by-step instructions…"
            />
          </Field>
          <div>
            <Button type="submit" disabled={saveBusy}>
              {saveBusy ? "Saving…" : "Save recipe"}
            </Button>
          </div>
        </form>
      </Section>

      {/* Ingredients */}
      <Section
        title="Ingredients"
        description={`${recipe.nutrition.ingredients.length} ingredient${recipe.nutrition.ingredients.length !== 1 ? "s" : ""}`}
      >
        {recipe.nutrition.ingredients.length === 0 ? (
          <EmptyState title="No ingredients yet">
            Use the search below to add foods to this recipe.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Food</th>
                <th>Amount</th>
                <th>Calories</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipe.nutrition.ingredients.map((row, index) => (
                <tr key={`${row.foodId}-${index}`}>
                  <Td label="Food">{row.foodName}</Td>
                  <Td label="Amount">
                    {row.quantity} {unitLabel(row.unit)}
                  </Td>
                  <Td label="Calories">
                    {row.presented.energyKcal !== null ? `${row.presented.energyKcal} kcal` : "—"}
                  </Td>
                  <Td label="">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void removeIngredient(index)}
                    >
                      Remove
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {/* Add ingredient */}
        <div style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Add ingredient</p>
          <div className="ui-row" style={{ flexWrap: "wrap", alignItems: "end" }}>
            <Field label="Search food">
              <Input
                value={foodQuery}
                onChange={(event) => setFoodQuery(event.target.value)}
                placeholder="Catalog or custom food…"
              />
            </Field>
            <Field label="Amount">
              <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </Field>
            <Field label="Unit">
              <select
                className="ui-input"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                {["g", "kg", "oz", "lb", "ml", "l", "fl_oz"].map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </select>
            </Field>
            <div>
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
                <div key={hit.id} className="ui-row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (hit.referenceQuantity != null) setQuantity(String(hit.referenceQuantity));
                      if (hit.referenceUnit) setUnit(hit.referenceUnit);
                      setServingHint(hit.servingDescription ?? null);
                      void addFood(hit);
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
      </Section>
    </section>
  );
}
