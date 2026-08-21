"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  Td,
  Textarea,
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

interface RecipeDetail {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  servings: number;
  status: string;
  origin?: "starter" | "practice";
  readOnly?: boolean;
  nutrition: {
    presentedTotal: Nutrition;
    presentedPerServing: Nutrition;
    presentedExtraNutrientsTotal?: ExtraNutrients;
    presentedExtraNutrientsPerServing?: ExtraNutrients;
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

function nutritionLine(n: Nutrition): string {
  const parts: string[] = [];
  if (n.energyKcal !== null) parts.push(`${n.energyKcal} kcal`);
  if (n.proteinG !== null) parts.push(`P ${n.proteinG}g`);
  if (n.carbohydrateG !== null) parts.push(`C ${n.carbohydrateG}g`);
  if (n.fatG !== null) parts.push(`F ${n.fatG}g`);
  if (n.fiberG !== null) parts.push(`Fiber ${n.fiberG}g`);
  return parts.join(" · ") || "—";
}

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "var(--accent, #0d9488)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span>{label}</span>
    </span>
  );
}

export default function RecipeDetailPage() {
  const params = useParams<{ dietitianAccountId: string; recipeId: string }>();
  const router = useRouter();
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
  const [actionBusy, setActionBusy] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);

  async function load() {
    const detail = await api<RecipeDetail>(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}`);
    setRecipe(detail);
    setName(detail.name);
    setServings(String(detail.servings));
    setDescription(detail.description ?? "");
    setInstructions(detail.instructions ?? "");
    setDetailsDirty(false);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load meal")));
  }, [dietitianAccountId, recipeId]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setSaveBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          servings: Number(servings),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
        }),
      });
      setNotice("Meal details saved.");
      setDetailsDirty(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not save details"));
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
    setNotice(null);
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
      setNotice(`Added ${hit.name}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not add ingredient"));
    }
  }

  async function removeIngredient(index: number) {
    if (!recipe) return;
    setError(null);
    setNotice(null);
    const ingredients = recipe.nutrition.ingredients
      .filter((_, i) => i !== index)
      .map((row) => ({
        foodId: row.foodId,
        quantity: row.quantity,
        unit: row.unit,
        displayNote: row.displayNote,
      }));
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

  async function duplicate() {
    setActionBusy(true);
    setError(null);
    try {
      const copy = await api<{ id: string }>(
        `/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}/duplicate`,
        { method: "POST" },
      );
      router.push(`/practice/${dietitianAccountId}/recipes/${copy.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not duplicate"));
      setActionBusy(false);
    }
  }

  async function deleteRecipe() {
    if (!recipe) return;
    if (!window.confirm(`Delete “${recipe.name}”? It will be archived and removed from the active library.`)) {
      return;
    }
    setActionBusy(true);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/recipes/${recipeId}/archive`, { method: "POST" });
      router.push(`/practice/${dietitianAccountId}/recipes`);
    } catch (err) {
      setError(errorMessage(err, "Could not delete"));
      setActionBusy(false);
    }
  }

  if (!recipe) {
    return (
      <section>
        {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading meal…</LoadingState>}
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
  const canEdit = recipe.status === "ACTIVE" && !recipe.readOnly;
  const ingredientCount = recipe.nutrition.ingredients.length;

  return (
    <section className="ui-stack" style={{ gap: 24, width: "100%" }}>
      <div>
        <Link
          href={`/practice/${dietitianAccountId}/recipes`}
          className="ui-link"
          style={{ fontSize: 13, display: "inline-block", marginBottom: 8 }}
        >
          ← Back to meal library
        </Link>
        <Breadcrumbs
          items={[
            { href: `/practice/${dietitianAccountId}/recipes`, label: "Meal library" },
            { label: recipe.name },
          ]}
        />
      </div>

      <PageHeader
        title={recipe.name}
        description={
          <>
            <Badge tone={recipe.origin === "starter" ? "info" : "neutral"}>
              {recipe.origin === "starter" ? "Starter" : "Clinic"}
            </Badge>
            {" · "}
            Reusable meal · {recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}
            {recipe.readOnly ? " · Platform recipes are read-only (duplicate to customize)" : ""}
            {recipe.status !== "ACTIVE" ? (
              <>
                {" · "}
                <StatusBadge status={recipe.status} label={statusLabel(recipe.status)} />
              </>
            ) : null}
          </>
        }
        actions={
          <div className="ui-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" disabled={actionBusy} onClick={() => void duplicate()}>
              Duplicate
            </Button>
            {canEdit ? (
              <Button variant="danger" disabled={actionBusy} onClick={() => void deleteRecipe()}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {/* Outcome of the workflow — always on top */}
      <Section
        title="Nutrition summary"
        description="Updates automatically when you add or remove ingredients."
        tone="mint"
      >
        {hasNutrition ? (
          <div className="ui-stack" style={{ gap: 16 }}>
            <div className="ui-row" style={{ flexWrap: "wrap", gap: 12 }}>
              <div className="ui-stat">
                <div className="ui-stat__label">Total</div>
                <div className="ui-stat__value">{fmt(total.energyKcal)} kcal</div>
              </div>
              <div className="ui-stat">
                <div className="ui-stat__label">Per serving</div>
                <div className="ui-stat__value">{fmt(perServing.energyKcal)} kcal</div>
              </div>
              <div className="ui-stat">
                <div className="ui-stat__label">Protein</div>
                <div className="ui-stat__value">{fmt(perServing.proteinG)}g</div>
              </div>
              <div className="ui-stat">
                <div className="ui-stat__label">Carbs</div>
                <div className="ui-stat__value">{fmt(perServing.carbohydrateG)}g</div>
              </div>
              <div className="ui-stat">
                <div className="ui-stat__label">Fat</div>
                <div className="ui-stat__value">{fmt(perServing.fatG)}g</div>
              </div>
              <div className="ui-stat">
                <div className="ui-stat__label">Fiber</div>
                <div className="ui-stat__value">{fmt(perServing.fiberG)}g</div>
              </div>
            </div>
            <ExtraNutrientTables
              values={recipe.nutrition.presentedExtraNutrientsPerServing ?? {}}
              caption="per serving"
              emptyMessage="No micronutrient data on the ingredient foods yet."
            />
          </div>
        ) : (
          <p className="ui-muted" style={{ margin: 0 }}>
            Complete step 2 below to see nutrition.
          </p>
        )}
      </Section>

      {/* Step 1 */}
      <Section
        title={<StepLabel n={1} label="Define the meal" />}
        description="Name, servings, and prep notes. Save this step before or after adding foods."
      >
        <form
          onSubmit={(event) => void saveDetails(event)}
          className="ui-stack"
          style={{ gap: 16 }}
          onChange={() => setDetailsDirty(true)}
        >
          <div className="ui-grid" style={{ gridTemplateColumns: "1fr minmax(100px, 140px)", gap: 16 }}>
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setDetailsDirty(true);
                }}
                required
                disabled={!canEdit}
              />
            </Field>
            <Field label="Servings" hint="Macros ÷ servings">
              <Input
                value={servings}
                type="number"
                min="1"
                step="1"
                onChange={(event) => {
                  setServings(event.target.value);
                  setDetailsDirty(true);
                }}
                disabled={!canEdit}
              />
            </Field>
          </div>
          <Field label="Description" hint="Optional short summary">
            <Textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setDetailsDirty(true);
              }}
              placeholder="e.g. High-protein breakfast with berries…"
              rows={2}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Instructions" hint="Optional prep steps">
            <Textarea
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value);
                setDetailsDirty(true);
              }}
              placeholder={"1. …\n2. …"}
              rows={4}
              disabled={!canEdit}
            />
          </Field>
          {canEdit ? (
            <div
              className="ui-row"
              style={{
                gap: 12,
                marginTop: 4,
                paddingTop: 16,
                borderTop: "1px solid var(--border, #e5e7eb)",
                alignItems: "center",
              }}
            >
              <Button type="submit" disabled={saveBusy || !detailsDirty}>
                {saveBusy ? "Saving…" : "Save meal details"}
              </Button>
              {detailsDirty ? (
                <span className="ui-muted" style={{ fontSize: 13 }}>
                  Unsaved changes
                </span>
              ) : (
                <span className="ui-muted" style={{ fontSize: 13 }}>
                  Details up to date
                </span>
              )}
            </div>
          ) : null}
        </form>
      </Section>

      {/* Step 2 — add first, then list */}
      <Section
        title={<StepLabel n={2} label="Build ingredients" />}
        description={`${ingredientCount} food${ingredientCount === 1 ? "" : "s"} · quantities are for the whole recipe · saves instantly`}
      >
        {canEdit ? (
          <div className="ui-stack" style={{ gap: 16, marginBottom: 20 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Add a food</p>
            <div className="ui-inline-form">
              <Field label="Search foods">
                <Input
                  value={foodQuery}
                  onChange={(event) => setFoodQuery(event.target.value)}
                  placeholder="Chicken, rice, yogurt…"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchFoods();
                    }
                  }}
                />
              </Field>
              <Field label="Amount">
                <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </Field>
              <Field label="Unit">
                <Select value={unit} onChange={(event) => setUnit(event.target.value)}>
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
              <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
                Serving hint: {servingHint}
              </p>
            ) : null}
            {foodHits.length > 0 ? (
              <div
                className="ui-stack"
                style={{
                  gap: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--surface-muted, #f3f4f6)",
                }}
              >
                <p className="ui-muted" style={{ margin: 0, fontSize: 12 }}>
                  Click to add with the amount above (or the food’s default).
                </p>
                {foodHits.map((hit) => (
                  <div
                    key={hit.id}
                    className="ui-row"
                    style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}
                  >
                    <Button
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
        ) : null}

        {ingredientCount === 0 ? (
          <EmptyState title="No ingredients yet">
            {canEdit
              ? "Search above and add foods. Nutrition at the top updates as you go."
              : "This meal has no ingredients."}
          </EmptyState>
        ) : (
          <div>
            <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 13 }}>
              Ingredient list
            </p>
            <Table>
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Amount</th>
                  <th>Nutrition</th>
                  {canEdit ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {recipe.nutrition.ingredients.map((row, index) => (
                  <tr key={`${row.foodId}-${index}`}>
                    <Td label="Food">
                      <strong>{row.foodName}</strong>
                      {row.displayNote ? (
                        <div className="ui-muted" style={{ fontSize: 12 }}>
                          {row.displayNote}
                        </div>
                      ) : null}
                    </Td>
                    <Td label="Amount">
                      {row.quantity} {unitLabel(row.unit)}
                    </Td>
                    <Td label="Nutrition">{nutritionLine(row.presented)}</Td>
                    {canEdit ? (
                      <Td label="">
                        <Button variant="danger" size="sm" onClick={() => void removeIngredient(index)}>
                          Remove
                        </Button>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Section>
    </section>
  );
}
