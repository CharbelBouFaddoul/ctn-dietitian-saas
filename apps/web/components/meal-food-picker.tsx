"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { foodSourceCaption, foodSourceShortLabel } from "../lib/food-source-label";
import { errorMessage } from "../lib/humanize-error";
import { unitLabel } from "../lib/practice-labels";

type Nutrition = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
};

type FoodHit = {
  id: string;
  name: string;
  origin?: "catalog" | "custom";
  servingDescription?: string | null;
  referenceQuantity: number;
  referenceUnit: "g" | "ml" | string;
  presentedNutrition?: Nutrition;
  source?: { key?: string; name: string; datasetVersion?: string | null };
};

type RecipeHit = {
  id: string;
  name: string;
  servings?: number;
  origin?: "starter" | "practice";
  ingredientCount?: number;
};

type FoodSource = {
  id: string;
  key?: string;
  name: string;
  foodCount?: number;
};

type FoodSort = "name" | "energy" | "fat" | "carbohydrate" | "protein";
type SortDir = "asc" | "desc";
type Tab = "food" | "recipe";
type Amount = { qty: string; unit: string };

const PAGE_SIZE = 6;
const MASS_UNITS = ["g", "kg", "oz", "lb"] as const;
const VOLUME_UNITS = ["ml", "l", "fl_oz"] as const;
const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const VOL_TO_ML: Record<string, number> = { ml: 1, l: 1000, fl_oz: 29.5735295625 };

type Props = {
  dietitianAccountId: string;
  onAddFood: (input: { foodId: string; quantity: number; unit: string }) => Promise<void>;
  onAddRecipe: (input: { recipeId: string; servings: number }) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
};

function trimAmount(value: number) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? String(millions) : millions.toFixed(1)}M`;
  }
  if (abs >= 10_000) return String(Math.round(value));
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function fmtNutrient(value: number | null | undefined, unit: "kcal" | "g") {
  if (value == null || !Number.isFinite(value)) return "—";
  const amount = trimAmount(Math.round(value));
  return unit === "kcal" ? `${amount} kcal` : `${amount} g`;
}

function compatibleUnits(referenceUnit: string) {
  return referenceUnit === "ml" ? VOLUME_UNITS : MASS_UNITS;
}

function scaleFactor(food: FoodHit, qty: number, unit: string) {
  if (!(qty > 0)) return 0;
  if (unit === "serving") return qty;
  const table = food.referenceUnit === "ml" ? VOL_TO_ML : MASS_TO_G;
  const quantityBase = table[unit];
  const referenceBase = table[food.referenceUnit];
  if (!quantityBase || !referenceBase || !(food.referenceQuantity > 0)) return 0;
  return (qty * quantityBase) / (food.referenceQuantity * referenceBase);
}

function amountLabel(food: FoodHit, qty: number, unit: string) {
  if (!(qty > 0)) return "—";
  if (unit === "serving") return `${trimAmount(qty * food.referenceQuantity)}${food.referenceUnit}`;
  const table = food.referenceUnit === "ml" ? VOL_TO_ML : MASS_TO_G;
  const quantityBase = table[unit];
  const referenceBase = table[food.referenceUnit];
  if (!quantityBase || !referenceBase) return `${trimAmount(qty)}${unit}`;
  return `${trimAmount((qty * quantityBase) / referenceBase)}${food.referenceUnit}`;
}

function servingOptionLabel(food: FoodHit) {
  const grams = `${trimAmount(food.referenceQuantity)} ${food.referenceUnit === "ml" ? "ml" : "grams"}`;
  if (food.servingDescription?.trim()) return `${food.servingDescription} (${grams})`;
  return `serving (${grams})`;
}

function pagerWindow(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (page >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages];
}

export function MealFoodPicker({ dietitianAccountId, onAddFood, onAddRecipe, onClose, onError }: Props) {
  const [tab, setTab] = useState<Tab>("food");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sourceKey, setSourceKey] = useState("all");
  const [sort, setSort] = useState<FoodSort>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [foods, setFoods] = useState<FoodHit[]>([]);
  const [foodTotal, setFoodTotal] = useState(0);
  const [recipes, setRecipes] = useState<RecipeHit[]>([]);
  const [recipeTotal, setRecipeTotal] = useState(0);
  const [sources, setSources] = useState<FoodSource[]>([]);
  const [amounts, setAmounts] = useState<Record<string, Amount>>({});
  const [recipeServings, setRecipeServings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debounced, sourceKey, sort, sortDir, tab]);

  useEffect(() => {
    void api<FoodSource[]>(`/api/v1/dietitian/${dietitianAccountId}/food-sources`)
      .then(setSources)
      .catch(() => setSources([]));
  }, [dietitianAccountId]);

  useEffect(() => {
    searchRef.current?.focus();
  }, [tab]);

  const foodParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debounced) params.set("q", debounced);
    if (sourceKey === "custom") params.set("origin", "custom");
    else if (sourceKey !== "all") {
      params.set("sourceId", sourceKey);
      params.set("origin", "catalog");
    }
    params.set("sort", sort);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [debounced, sourceKey, sort, sortDir, page]);

  const recipeParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debounced) params.set("q", debounced);
    params.set("status", "ACTIVE");
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [debounced, page]);

  useEffect(() => {
    if (tab !== "food") return;
    const id = ++requestId.current;
    setLoading(true);
    void api<{ items: FoodHit[]; total: number }>(`/api/v1/dietitian/${dietitianAccountId}/foods?${foodParams}`)
      .then((result) => {
        if (id !== requestId.current) return;
        setFoods(result.items);
        setFoodTotal(result.total);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        onErrorRef.current(errorMessage(err, "Food search failed"));
        setFoods([]);
        setFoodTotal(0);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [dietitianAccountId, foodParams, tab]);

  useEffect(() => {
    if (tab !== "recipe") return;
    const id = ++requestId.current;
    setLoading(true);
    void api<{ items: RecipeHit[]; total: number }>(
      `/api/v1/dietitian/${dietitianAccountId}/recipes?${recipeParams}`,
    )
      .then((result) => {
        if (id !== requestId.current) return;
        setRecipes(result.items);
        setRecipeTotal(result.total);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        onErrorRef.current(errorMessage(err, "Recipe search failed"));
        setRecipes([]);
        setRecipeTotal(0);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [dietitianAccountId, recipeParams, tab]);

  function amountFor(food: FoodHit): Amount {
    return amounts[food.id] ?? { qty: "1", unit: "serving" };
  }

  function setAmount(foodId: string, patch: Partial<Amount>) {
    setAmounts((curr) => {
      const prev = curr[foodId] ?? { qty: "1", unit: "serving" };
      return { ...curr, [foodId]: { ...prev, ...patch } };
    });
  }

  async function addFood(food: FoodHit) {
    const amount = amountFor(food);
    const qty = Number(amount.qty);
    if (!(qty > 0)) return;
    const quantity = amount.unit === "serving" ? qty * food.referenceQuantity : qty;
    const unit = amount.unit === "serving" ? food.referenceUnit : amount.unit;
    setAddingId(food.id);
    try {
      await onAddFood({ foodId: food.id, quantity, unit });
    } finally {
      setAddingId(null);
    }
  }

  async function addRecipe(recipe: RecipeHit) {
    const servings = Number(recipeServings[recipe.id] ?? "1");
    if (!(servings > 0)) return;
    setAddingId(recipe.id);
    try {
      await onAddRecipe({ recipeId: recipe.id, servings });
    } finally {
      setAddingId(null);
    }
  }

  const total = tab === "food" ? foodTotal : recipeTotal;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages = pagerWindow(page, totalPages);

  return (
    <section className="ui-food-pick" aria-label={tab === "food" ? "Add new food" : "Add recipe"}>
      <header className="ui-food-pick__top">
        <div className="ui-food-pick__title-row">
          <h5>{tab === "food" ? "Add new food" : "Add recipe"}</h5>
          <div className="ui-food-pick__tabs" role="tablist" aria-label="Food or recipe">
            <button type="button" role="tab" aria-selected={tab === "food"} className={tab === "food" ? "is-active" : undefined} onClick={() => setTab("food")}>
              Food
            </button>
            <button type="button" role="tab" aria-selected={tab === "recipe"} className={tab === "recipe" ? "is-active" : undefined} onClick={() => setTab("recipe")}>
              Recipe
            </button>
          </div>
        </div>
        <button type="button" className="ui-food-pick__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="ui-food-pick__toolbar">
        <label className="ui-food-pick__search">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "food" ? "Search food" : "Search recipes"}
            autoComplete="off"
            aria-label={tab === "food" ? "Search food" : "Search recipes"}
          />
        </label>
        {tab === "food" ? (
          <>
            <button
              type="button"
              className="ui-food-pick__sort-dir"
              aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
              onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
            >
              <SortDirIcon dir={sortDir} />
            </button>
            <select
              className="ui-food-pick__select"
              value={sort}
              aria-label="Sort by"
              onChange={(event) => {
                const next = event.target.value as FoodSort;
                setSort(next);
                setSortDir(next === "name" ? "asc" : "desc");
              }}
            >
              <option value="name">Sort by name</option>
              <option value="energy">Sort by energy</option>
              <option value="fat">Sort by fat</option>
              <option value="carbohydrate">Sort by carbohydrate</option>
              <option value="protein">Sort by protein</option>
            </select>
            <select
              className="ui-food-pick__select ui-food-pick__select--source"
              value={sourceKey}
              aria-label="Database"
              onChange={(event) => setSourceKey(event.target.value)}
            >
              <option value="all">All databases</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {foodSourceShortLabel(source)}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </>
        ) : null}
      </div>

      {tab === "food" ? (
        <div className="ui-food-pick__table-wrap">
          <div className="ui-food-pick__table" role="table">
            <div className="ui-food-pick__head" role="row">
              <span className="ui-food-pick__head-info">Nutritional Information</span>
              <span>Energy</span>
              <span>Fat</span>
              <span>Carbohydrate</span>
              <span>Protein</span>
              <span className="ui-food-pick__head-add" />
            </div>
            {loading && foods.length === 0 ? (
              <p className="ui-food-pick__empty">Loading…</p>
            ) : foods.length === 0 ? (
              <p className="ui-food-pick__empty">No foods match.</p>
            ) : (
              foods.map((food) => {
                const amount = amountFor(food);
                const qty = Number(amount.qty);
                const factor = scaleFactor(food, qty, amount.unit);
                const nutrition = food.presentedNutrition;
                const converted =
                  amount.unit === food.referenceUnit ? null : amountLabel(food, qty, amount.unit);
                const source = foodSourceCaption(food.source, food.origin);
                const energy = fmtNutrient(nutrition?.energyKcal == null ? null : nutrition.energyKcal * factor, "kcal");
                const fat = fmtNutrient(nutrition?.fatG == null ? null : nutrition.fatG * factor, "g");
                const carb = fmtNutrient(nutrition?.carbohydrateG == null ? null : nutrition.carbohydrateG * factor, "g");
                const protein = fmtNutrient(nutrition?.proteinG == null ? null : nutrition.proteinG * factor, "g");
                return (
                  <div key={food.id} className="ui-food-pick__row" role="row">
                    <div className="ui-food-pick__amount">
                      <input
                        className="ui-food-pick__qty"
                        value={amount.qty}
                        title={amount.qty}
                        inputMode="decimal"
                        aria-label={`Amount for ${food.name}`}
                        onChange={(event) => setAmount(food.id, { qty: event.target.value })}
                      />
                      <select
                        className="ui-food-pick__unit"
                        value={amount.unit}
                        aria-label={`Unit for ${food.name}`}
                        onChange={(event) => setAmount(food.id, { unit: event.target.value })}
                      >
                        <option value="serving">{servingOptionLabel(food)}</option>
                        {compatibleUnits(food.referenceUnit).map((unit) => (
                          <option key={unit} value={unit}>
                            {unitLabel(unit)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="ui-food-pick__identity">
                      <strong>{food.name}</strong>
                      <small>
                        {source}
                        {converted ? ` · ${converted}` : ""}
                      </small>
                    </span>
                    <span className="ui-food-pick__n" title={energy}>
                      {energy}
                    </span>
                    <span className="ui-food-pick__n" title={fat}>
                      {fat}
                    </span>
                    <span className="ui-food-pick__n" title={carb}>
                      {carb}
                    </span>
                    <span className="ui-food-pick__n" title={protein}>
                      {protein}
                    </span>
                    <button
                      type="button"
                      className="ui-food-pick__add"
                      aria-label={`Add ${food.name}`}
                      disabled={addingId === food.id || !(qty > 0)}
                      onClick={() => void addFood(food)}
                    >
                      +
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="ui-food-pick__table-wrap">
          <div className="ui-food-pick__table ui-food-pick__table--recipes" role="table">
            <div className="ui-food-pick__head ui-food-pick__head--recipes" role="row">
              <span className="ui-food-pick__head-info">Recipe</span>
              <span className="ui-food-pick__head-add" />
            </div>
            {loading && recipes.length === 0 ? (
              <p className="ui-food-pick__empty">Loading…</p>
            ) : recipes.length === 0 ? (
              <p className="ui-food-pick__empty">No recipes match.</p>
            ) : (
              recipes.map((recipe) => {
                const servings = recipeServings[recipe.id] ?? "1";
                return (
                  <div key={recipe.id} className="ui-food-pick__row ui-food-pick__row--recipe" role="row">
                    <div className="ui-food-pick__amount">
                      <input
                        className="ui-food-pick__qty"
                        value={servings}
                        title={servings}
                        inputMode="decimal"
                        aria-label={`Servings of ${recipe.name}`}
                        onChange={(event) =>
                          setRecipeServings((curr) => ({ ...curr, [recipe.id]: event.target.value }))
                        }
                      />
                      <span className="ui-food-pick__grams">serv</span>
                    </div>
                    <span className="ui-food-pick__identity">
                      <strong>{recipe.name}</strong>
                      <small>
                        {recipe.origin === "starter" ? "Starter" : "Practice"}
                        {recipe.ingredientCount != null ? ` · ${recipe.ingredientCount} foods` : ""}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="ui-food-pick__add"
                      aria-label={`Add ${recipe.name}`}
                      disabled={addingId === recipe.id || !(Number(servings) > 0)}
                      onClick={() => void addRecipe(recipe)}
                    >
                      +
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="ui-food-pick__pager" aria-label="Pages">
          <button type="button" disabled={page <= 1} aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          {pages.map((item, index) =>
            item === "ellipsis" ? (
              <span key={`e-${index}`} className="ui-food-pick__ellipsis">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page ? "is-active" : undefined}
                aria-current={item === page ? "page" : undefined}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page >= totalPages}
            aria-label="Next page"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ›
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SortDirIcon({ dir }: { dir: SortDir }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 15 12 20 16 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={dir === "desc" ? 1 : 0.35} />
      <path d="M8 9 12 4 16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={dir === "asc" ? 1 : 0.35} />
    </svg>
  );
}
