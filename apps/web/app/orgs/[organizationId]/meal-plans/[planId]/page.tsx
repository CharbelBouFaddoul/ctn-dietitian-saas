"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "../../../../../lib/api";
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

function kcal(value: number | null): string {
  return value === null ? "unknown" : `${value} kcal`;
}

export default function MealPlanEditorPage() {
  const params = useParams<{ organizationId: string; planId: string }>();
  const search = useSearchParams();
  const { organizationId, planId } = params;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [foodQuery, setFoodQuery] = useState("");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [foodHits, setFoodHits] = useState<Array<{ id: string; name: string }>>([]);
  const [recipeHits, setRecipeHits] = useState<Array<{ id: string; name: string }>>([]);
  const [quantity, setQuantity] = useState("100");
  const [recipeServings, setRecipeServings] = useState("1");
  const [unit, setUnit] = useState("g");
  const [error, setError] = useState<string | null>(null);

  const versionId = useMemo(() => {
    if (search.get("versionId")) return search.get("versionId");
    const draft = plan?.versions.find((row) => row.status === "DRAFT");
    const published = plan?.versions.find((row) => row.status === "PUBLISHED");
    return draft?.id ?? published?.id ?? plan?.versions[0]?.id;
  }, [search, plan]);

  async function load(nextVersionId?: string) {
    const detail = await api<PlanDetail>(`/api/v1/organizations/${organizationId}/meal-plans/${planId}`);
    setPlan(detail);
    const selected = nextVersionId ?? versionId ?? detail.versions.find((row) => row.status === "DRAFT")?.id ?? detail.versions[0]?.id;
    if (!selected) return;
    const loaded = await api<VersionDetail>(
      `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${selected}`,
    );
    setVersion(loaded);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load plan"));
  }, [organizationId, planId, versionId]);

  const day = version?.snapshot.days[dayIndex];
  const canEdit = version?.status === "DRAFT" && !version.immutable;

  async function publish() {
    if (!version) return;
    await api(`/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/publish`, {
      method: "POST",
    });
    await load(version.id);
  }

  async function newDraft() {
    const created = await api<VersionDetail>(`/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions`, {
      method: "POST",
    });
    window.location.href = `/orgs/${organizationId}/meal-plans/${planId}?versionId=${created.id}`;
  }

  async function addFood(mealId: string, foodId: string) {
    if (!version) return;
    await api(
      `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
      { method: "POST", body: JSON.stringify({ itemType: "FOOD", foodId, quantity: Number(quantity), unit }) },
    );
    await load(version.id);
  }

  async function addRecipe(mealId: string, recipeId: string) {
    if (!version) return;
    await api(
      `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/meals/${mealId}/items`,
      { method: "POST", body: JSON.stringify({ itemType: "RECIPE", recipeId, quantity: Number(recipeServings), unit: "serving" }) },
    );
    await load(version.id);
  }

  if (!plan || !version) {
    return <section>{error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : <p>Loading plan…</p>}</section>;
  }

  return (
    <section>
      <p>
        <Link href={`/orgs/${organizationId}/meal-plans`} style={{ color: "var(--color-accent)" }}>
          Back to meal plans
        </Link>
      </p>
      <h1>{plan.name}</h1>
      <p>
        Version {version.versionNumber} · {version.status}
        {version.immutable ? " · immutable snapshot" : " · live effective foods"}
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {plan.versions.map((row) => (
          <Link
            key={row.id}
            href={`/orgs/${organizationId}/meal-plans/${planId}?versionId=${row.id}`}
            style={{ color: row.id === version.id ? "var(--color-accent)" : "var(--color-muted)" }}
          >
            v{row.versionNumber} {row.status}
          </Link>
        ))}
      </p>
      <p style={{ display: "flex", gap: 8 }}>
        {canEdit ? (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => void publish().catch((err) => setError(err instanceof Error ? err.message : "Publish failed"))}>
            Publish
          </button>
        ) : (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => void newDraft().catch((err) => setError(err instanceof Error ? err.message : "Draft failed"))}>
            New draft from this version
          </button>
        )}
        {canEdit ? (
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={() =>
              void api(`/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/days`, {
                method: "POST",
                body: JSON.stringify({}),
              }).then(() => load(version.id))
            }
          >
            Add day
          </button>
        ) : null}
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {version.snapshot.days.map((item, index) => (
          <button key={item.id} type="button" className="ui-btn ui-btn--primary" onClick={() => setDayIndex(index)}>
            {item.title ?? `Day ${item.dayNumber}`} ({kcal(item.presented.energyKcal)})
          </button>
        ))}
      </div>
      {day ? (
        <>
          <h2>
            {day.title ?? `Day ${day.dayNumber}`} · {kcal(day.presented.energyKcal)} · P {day.presented.proteinG ?? "—"} · C{" "}
            {day.presented.carbohydrateG ?? "—"} · F {day.presented.fatG ?? "—"}
          </h2>
          {day.meals.map((meal) => (
            <div key={meal.id} style={{ marginBottom: 16, background: "var(--color-surface)", padding: 12, borderRadius: 8 }}>
              <h3>
                {meal.name} · {kcal(meal.presented.energyKcal)}
              </h3>
              <table className="ui-table">
                <tbody>
                  {meal.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.food?.name ?? item.recipe?.name}</td>
                      <td>
                        {item.quantity} {item.unit}
                      </td>
                      <td>{kcal(item.presented.energyKcal)}</td>
                      <td>
                        {canEdit ? (
                          <button
                            type="button"
                            className="ui-btn ui-btn--primary"
                            onClick={() =>
                              void api(
                                `/api/v1/organizations/${organizationId}/meal-plans/${planId}/versions/${version.id}/items/${item.id}`,
                                { method: "DELETE" },
                              ).then(() => load(version.id))
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canEdit ? (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <input className="ui-input" value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} placeholder="Search food" />
                  <input className="ui-input" style={{width: 80}} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                  <select className="ui-input" value={unit} onChange={(event) => setUnit(event.target.value)}>
                    {["g", "kg", "oz", "lb", "ml", "l", "fl_oz"].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    onClick={() =>
                      void api<{ items: Array<{ id: string; name: string }> }>(
                        `/api/v1/organizations/${organizationId}/foods?q=${encodeURIComponent(foodQuery)}&pageSize=5`,
                      ).then((result) => setFoodHits(result.items))
                    }
                  >
                    Find food
                  </button>
                  {foodHits.map((hit) => (
                    <button key={hit.id} type="button" className="ui-btn ui-btn--primary" onClick={() => void addFood(meal.id, hit.id)}>
                      Add {hit.name}
                    </button>
                  ))}
                  <input className="ui-input" value={recipeQuery} onChange={(event) => setRecipeQuery(event.target.value)} placeholder="Search recipe" />
                  <input
                    className="ui-input" style={{width: 80}}
                    value={recipeServings}
                    onChange={(event) => setRecipeServings(event.target.value)}
                    title="Recipe servings"
                  />
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    onClick={() =>
                      void api<{ items: Array<{ id: string; name: string }> }>(
                        `/api/v1/organizations/${organizationId}/recipes?q=${encodeURIComponent(recipeQuery)}&pageSize=5`,
                      ).then((result) => setRecipeHits(result.items))
                    }
                  >
                    Find recipe
                  </button>
                  {recipeHits.map((hit) => (
                    <button key={hit.id} type="button" className="ui-btn ui-btn--primary" onClick={() => void addRecipe(meal.id, hit.id)}>
                      Add {hit.name} (servings)
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <p>No days yet.</p>
      )}
    </section>
  );
}
