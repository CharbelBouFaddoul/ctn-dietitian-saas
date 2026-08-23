"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@nutrition-saas/ui";
import { api } from "../../../../../lib/api";
import {
  ExtraNutrientTables,
  hasExtraNutrients,
} from "../../../../../lib/extra-nutrient-tables";
import { errorMessage } from "../../../../../lib/humanize-error";
import type { ExtraNutrients } from "../../../../../lib/micronutrients";
import { unitLabel } from "../../../../../lib/practice-labels";

type MealCategory = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" | "OTHER";
type FoodOriginFilter = "all" | "catalog" | "custom";

interface FoodHit {
  id: string;
  name: string;
  origin?: "catalog" | "custom";
  category?: string | null;
  servingDescription?: string | null;
  referenceQuantity?: number;
  referenceUnit?: string;
  presentedNutrition?: {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
  };
  presentedExtraNutrients?: ExtraNutrients;
  extraNutrients?: ExtraNutrients;
  source?: { name: string };
}

const UNITS = ["g", "kg", "oz", "lb", "ml", "l", "fl_oz"] as const;
const MEAL_CATEGORIES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "OTHER"] as const;
const PAGE_SIZE = 30;

const MEAL_LABELS: Record<MealCategory, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
  OTHER: "Other",
};

function formatKcal(value: number | null | undefined): string {
  return value == null ? "—" : `${value} kcal`;
}

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ClientAddFoodPageInner() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayLocal();
  const backHref = `/client/tracking?date=${encodeURIComponent(date)}`;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [origin, setOrigin] = useState<FoodOriginFilter>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FoodHit | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("g");
  const [mealCategory, setMealCategory] = useState<MealCategory>("LUNCH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    void api<string[]>("/api/v1/portal/foods/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, category, origin]);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (category) params.set("category", category);
    if (origin !== "all") params.set("origin", origin);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [debouncedQuery, category, origin, page]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    void api<{ items: FoodHit[]; total: number }>(`/api/v1/portal/foods?${listQuery}`)
      .then((result) => {
        if (id !== requestId.current) return;
        setHits(result.items);
        setTotal(result.total);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(errorMessage(err, "Unable to load foods"));
        setHits([]);
        setTotal(0);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [listQuery]);

  function pickFood(hit: FoodHit) {
    setSelected(hit);
    setNotice(null);
    setError(null);
    if (hit.referenceQuantity != null && hit.referenceQuantity > 0) {
      setQuantity(String(hit.referenceQuantity));
    }
    if (hit.referenceUnit && UNITS.includes(hit.referenceUnit as (typeof UNITS)[number])) {
      setUnit(hit.referenceUnit as (typeof UNITS)[number]);
    }
  }

  async function logFood(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const qty = Number(quantity);
    if (!(qty > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        foodId: selected.id,
        quantity: qty,
        unit,
        mealCategory,
      };
      if (date !== todayLocal()) {
        body.consumedAt = new Date(`${date}T12:00:00`).toISOString();
      }
      await api("/api/v1/portal/tracking/food-logs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(`${selected.name} added to your log.`);
      setSelected(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to add food"));
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="ui-client-add-food">
      <PageHeader
        eyebrow="Daily log"
        title="Add food"
        description={`Browse the food library and log what you ate on ${date}.`}
        actions={
          <Link href={backHref} className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to Daily log
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? (
        <Alert tone="success">
          <span className="ui-alert__body">
            <span>{notice}</span>
            <Link href={backHref} className="ui-btn ui-btn--secondary ui-btn--sm">
              Return to Daily log
            </Link>
          </span>
        </Alert>
      ) : null}

      <div className="ui-client-add-food__toolbar">
        <div className="ui-client-add-food__search">
          <label className="ui-client-add-food__label" htmlFor="client-food-search">
            Search
          </label>
          <Input
            id="client-food-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setNotice(null);
            }}
            placeholder="Search foods by name…"
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="ui-client-add-food__filters">
          <div className="ui-client-add-food__filter">
            <span className="ui-client-add-food__label">Category</span>
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="ui-client-add-food__filter">
            <span className="ui-client-add-food__label">Source</span>
            <div className="ui-client-add-food__segments" role="group" aria-label="Food source">
              {(
                [
                  ["all", "All"],
                  ["catalog", "Catalog"],
                  ["custom", "Dietitian’s"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`ui-client-add-food__segment${origin === value ? " is-active" : ""}`}
                  onClick={() => setOrigin(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ui-client-add-food__layout">
        <div className="ui-client-add-food__browse">
          <div className="ui-client-add-food__browse-head">
            <div>
              <strong>Foods</strong>
              <p className="ui-muted">
                {loading
                  ? "Loading…"
                  : total === 0
                    ? "No foods match these filters"
                    : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
              </p>
            </div>
            {(query || category || origin !== "all") && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setOrigin("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className="ui-client-add-food__results" aria-live="polite">
            {loading && hits.length === 0 ? <LoadingState>Loading foods…</LoadingState> : null}

            {!loading && hits.length === 0 ? (
              <EmptyState title="No foods found">
                Try clearing filters or searching a different name.
              </EmptyState>
            ) : null}

            {hits.length > 0 ? (
              <ul className="ui-client-add-food__list">
                {hits.map((hit) => {
                  const active = selected?.id === hit.id;
                  const kcal = hit.presentedNutrition?.energyKcal;
                  const isDietitian = hit.origin === "custom";
                  return (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className={`ui-client-add-food__hit${active ? " is-selected" : ""}`}
                        onClick={() => pickFood(hit)}
                      >
                        <span className="ui-client-add-food__hit-main">
                          <span className="ui-client-add-food__hit-title">
                            <strong>{hit.name}</strong>
                            <span
                              className={`ui-client-add-food__origin${isDietitian ? " is-dietitian" : ""}`}
                            >
                              {isDietitian ? "Dietitian’s food" : "Catalog"}
                            </span>
                          </span>
                          <span className="ui-client-add-food__hit-meta">
                            {[
                              hit.category,
                              hit.referenceQuantity != null && hit.referenceUnit
                                ? `Serving ${hit.referenceQuantity} ${unitLabel(hit.referenceUnit)}`
                                : null,
                              !isDietitian ? hit.source?.name : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="ui-client-add-food__hit-side">
                          <span className="ui-client-add-food__hit-kcal">{formatKcal(kcal)}</span>
                          <span className="ui-client-add-food__hit-action">
                            {active ? "Selected" : "Select"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {totalPages > 1 ? (
            <div className="ui-client-add-food__pager">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="ui-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>

        <aside className="ui-client-add-food__detail">
          {selected ? (
            <form className="ui-client-add-food__form" onSubmit={(event) => void logFood(event)}>
              <div className="ui-client-add-food__selected">
                <p className="ui-client-add-food__eyebrow">Selected</p>
                <h2>{selected.name}</h2>
                <div className="ui-client-add-food__macros">
                  <span>
                    <em>{formatKcal(selected.presentedNutrition?.energyKcal)}</em>
                    Energy
                  </span>
                  <span>
                    <em>
                      {selected.presentedNutrition?.proteinG != null
                        ? `${selected.presentedNutrition.proteinG}g`
                        : "—"}
                    </em>
                    Protein
                  </span>
                  <span>
                    <em>
                      {selected.presentedNutrition?.carbohydrateG != null
                        ? `${selected.presentedNutrition.carbohydrateG}g`
                        : "—"}
                    </em>
                    Carbs
                  </span>
                  <span>
                    <em>
                      {selected.presentedNutrition?.fatG != null
                        ? `${selected.presentedNutrition.fatG}g`
                        : "—"}
                    </em>
                    Fat
                  </span>
                </div>
                <div className="ui-client-add-food__chips">
                  {selected.origin === "custom" ? (
                    <span className="ui-client-add-food__chip is-dietitian">Dietitian’s food</span>
                  ) : (
                    <span className="ui-client-add-food__chip">Catalog</span>
                  )}
                  {selected.category ? (
                    <span className="ui-client-add-food__chip">{selected.category}</span>
                  ) : null}
                </div>
                {hasExtraNutrients(
                  selected.presentedExtraNutrients ?? selected.extraNutrients,
                ) ? (
                  <div className="ui-client-add-food__micros">
                    <ExtraNutrientTables
                      key={selected.id}
                      values={selected.presentedExtraNutrients ?? selected.extraNutrients ?? {}}
                      caption={
                        selected.referenceQuantity != null && selected.referenceUnit
                          ? `per ${selected.referenceQuantity} ${unitLabel(selected.referenceUnit)}`
                          : "per serving"
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="ui-client-add-food__fields">
                <Field label="Amount">
                  <Input
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="Unit">
                  <Select
                    value={unit}
                    onChange={(event) => setUnit(event.target.value as (typeof UNITS)[number])}
                  >
                    {UNITS.map((item) => (
                      <option key={item} value={item}>
                        {unitLabel(item)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Meal">
                  <Select
                    value={mealCategory}
                    onChange={(event) => setMealCategory(event.target.value as MealCategory)}
                  >
                    {MEAL_CATEGORIES.map((item) => (
                      <option key={item} value={item}>
                        {MEAL_LABELS[item]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="ui-client-add-food__actions">
                <Button type="submit" disabled={busy}>
                  {busy ? "Logging…" : "Log food"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Clear
                </Button>
              </div>
            </form>
          ) : (
            <div className="ui-client-add-food__placeholder">
              <strong>Select a food</strong>
              <p className="ui-muted">
                Pick from the list, then set amount, unit, and meal before logging.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export default function ClientAddFoodPage() {
  return (
    <Suspense fallback={<LoadingState>Loading foods…</LoadingState>}>
      <ClientAddFoodPageInner />
    </Suspense>
  );
}
