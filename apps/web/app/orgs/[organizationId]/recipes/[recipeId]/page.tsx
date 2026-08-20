"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
interface Nutrition {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
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

function format(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

export default function RecipeDetailPage() {
  const params = useParams<{ organizationId: string; recipeId: string }>();
  const { organizationId, recipeId } = params;
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodHits, setFoodHits] = useState<Array<{ id: string; name: string }>>([]);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const detail = await api<RecipeDetail>(`/api/v1/organizations/${organizationId}/recipes/${recipeId}`);
    setRecipe(detail);
    setName(detail.name);
    setServings(String(detail.servings));
    setDescription(detail.description ?? "");
    setInstructions(detail.instructions ?? "");
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load recipe"));
  }, [organizationId, recipeId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await api(`/api/v1/organizations/${organizationId}/recipes/${recipeId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, servings: Number(servings), description, instructions }),
    });
    await load();
  }

  async function searchFoods() {
    const result = await api<{ items: Array<{ id: string; name: string }> }>(
      `/api/v1/organizations/${organizationId}/foods?q=${encodeURIComponent(foodQuery)}&pageSize=8`,
    );
    setFoodHits(result.items);
  }

  async function addFood(foodId: string) {
    if (!recipe) return;
    const ingredients = recipe.nutrition.ingredients.map((row) => ({
      foodId: row.foodId,
      quantity: row.quantity,
      unit: row.unit,
      displayNote: row.displayNote,
    }));
    ingredients.push({ foodId, quantity: Number(quantity), unit, displayNote: null });
    await api(`/api/v1/organizations/${organizationId}/recipes/${recipeId}/ingredients`, {
      method: "PUT",
      body: JSON.stringify({ ingredients }),
    });
    setFoodHits([]);
    await load();
  }

  async function removeIngredient(index: number) {
    if (!recipe) return;
    const ingredients = recipe.nutrition.ingredients
      .filter((_, itemIndex) => itemIndex !== index)
      .map((row) => ({ foodId: row.foodId, quantity: row.quantity, unit: row.unit, displayNote: row.displayNote }));
    await api(`/api/v1/organizations/${organizationId}/recipes/${recipeId}/ingredients`, {
      method: "PUT",
      body: JSON.stringify({ ingredients }),
    });
    await load();
  }

  if (!recipe) {
    return <section>{error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : <p>Loading recipe…</p>}</section>;
  }

  return (
    <section>
      <p>
        <Link href={`/orgs/${organizationId}/recipes`} style={{ color: "var(--color-accent)" }}>
          Back to recipes
        </Link>
      </p>
      <h1>{recipe.name}</h1>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <p>
        Total {format(recipe.nutrition.presentedTotal.energyKcal)} kcal · Per serving{" "}
        {format(recipe.nutrition.presentedPerServing.energyKcal)} kcal
      </p>
      <form onSubmit={(event) => void save(event).catch((err) => setError(err instanceof Error ? err.message : "Save failed"))}>
        <label className="ui-field">
          Name
          <input className="ui-input" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="ui-field">
          Servings
          <input className="ui-input" value={servings} onChange={(event) => setServings(event.target.value)} />
        </label>
        <label className="ui-field">
          Description
          <textarea className="ui-input" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="ui-field">
          Instructions
          <textarea className="ui-input" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
        </label>
        <button type="submit" className="ui-btn ui-btn--primary">
          Save recipe
        </button>
      </form>
      <h2>Ingredients</h2>
      <table className="ui-table">
        <thead>
          <tr>
            <th>Food</th>
            <th>Quantity</th>
            <th>kcal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {recipe.nutrition.ingredients.map((row, index) => (
            <tr key={`${row.foodId}-${index}`}>
              <td>{row.foodName}</td>
              <td>
                {row.quantity} {row.unit}
              </td>
              <td>{format(row.presented.energyKcal)}</td>
              <td>
                <button type="button" className="ui-btn ui-btn--primary" onClick={() => void removeIngredient(index)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="ui-input" value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} placeholder="Search foods" />
        <input className="ui-input" style={{width: 90}} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <select className="ui-input" value={unit} onChange={(event) => setUnit(event.target.value)}>
          {["g", "kg", "oz", "lb", "ml", "l", "fl_oz"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => void searchFoods()}>
          Search
        </button>
      </div>
      {foodHits.map((hit) => (
        <p key={hit.id}>
          {hit.name}{" "}
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => void addFood(hit.id)}>
            Add
          </button>
        </p>
      ))}
      <p style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          onClick={() =>
            void api<{ id: string }>(`/api/v1/organizations/${organizationId}/recipes/${recipeId}/duplicate`, { method: "POST" }).then(
              (copy) => {
                window.location.href = `/orgs/${organizationId}/recipes/${copy.id}`;
              },
            )
          }
        >
          Duplicate
        </button>
        {recipe.status === "ACTIVE" ? (
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() =>
              void api(`/api/v1/organizations/${organizationId}/recipes/${recipeId}/archive`, { method: "POST" }).then(() => load())
            }
          >
            Archive
          </button>
        ) : null}
      </p>
    </section>
  );
}
