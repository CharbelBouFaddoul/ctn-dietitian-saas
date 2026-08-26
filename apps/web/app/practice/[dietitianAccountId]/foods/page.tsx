"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { foodSourceShortLabel } from "../../../../lib/food-source-label";
import { unitLabel } from "../../../../lib/practice-labels";

interface NutritionValues {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

interface FoodRow {
  id: string;
  name: string;
  category: string | null;
  servingDescription: string | null;
  referenceQuantity: number;
  referenceUnit: string;
  origin: "catalog" | "custom";
  presentedNutrition: NutritionValues;
  source: { id: string; key?: string; name: string };
}

interface ListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: FoodRow[];
}

interface FoodSource {
  id: string;
  key?: string;
  name: string;
  foodCount?: number;
}

function fmtNutrient(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default function FoodsPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [origin, setOrigin] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [sources, setSources] = useState<FoodSource[]>([]);
  const [sourcesReady, setSourcesReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCatalogOrigin = !sourcesReady || sources.length > 0;
  const originFilter = origin === "catalog" && !showCatalogOrigin ? "all" : origin;
  const showSourceFilter = showCatalogOrigin && originFilter !== "custom";
  const activeSourceId = showSourceFilter ? sourceId : "";

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (activeSourceId) p.set("sourceId", activeSourceId);
    if (originFilter && originFilter !== "all") p.set("origin", originFilter);
    p.set("page", String(page));
    p.set("pageSize", "25");
    return p.toString();
  }, [q, category, activeSourceId, originFilter, page]);

  async function load() {
    setError(null);
    try {
      const [list, categoryRows, sourceRows] = await Promise.all([
        api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/foods?${query}`),
        api<string[]>(`/api/v1/dietitian/${dietitianAccountId}/foods/categories`),
        api<FoodSource[]>(`/api/v1/dietitian/${dietitianAccountId}/food-sources`),
      ]);
      setData(list);
      setCategories(categoryRows);
      setSources(sourceRows);
      setSourcesReady(true);
    } catch (err) {
      setError(errorMessage(err, "Unable to load foods"));
    }
  }

  useEffect(() => {
    void load();
  }, [query, dietitianAccountId]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const items = data?.items ?? [];

  return (
    <section>
      <PageHeader
        title="Food database"
        description="Search catalog sources separately (USDA Foundation, USDA SR Legacy, and later CNF) or your clinic custom foods. Catalog foods are read-only; duplicate one to edit a clinic copy."
        actions={
          <Link href={`/practice/${dietitianAccountId}/foods/new`} className="ui-btn ui-btn--primary ui-btn--sm">
            New custom food
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form onSubmit={onSearch} className="ui-inline-form" style={{ margin: "20px 0" }}>
        <Field label="Search">
          <input
            className="ui-input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Food name…"
          />
        </Field>
        <Field label="Origin">
          <Select
            value={originFilter}
            onChange={(event) => {
              const next = event.target.value;
              setOrigin(next);
              if (next === "custom") setSourceId("");
              setPage(1);
            }}
          >
            <option value="all">All</option>
            {showCatalogOrigin ? <option value="catalog">Catalog</option> : null}
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        {showSourceFilter ? (
          <Field label="Source">
            <Select
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {foodSourceShortLabel(item)}
                  {item.foodCount != null ? ` (${item.foodCount})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <div className="ui-inline-form__action">
          <Button type="submit">Apply filters</Button>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState title={q ? "No foods match this search" : "No foods found"}>
          {q ? "Try a different search term or clear filters." : "No foods available for this source or category."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Food</th>
              <th>Source</th>
              <th>Category</th>
              <th>Reference</th>
              <th>Calories</th>
              <th>Protein</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <Td label="Food">
                  <Link href={`/practice/${dietitianAccountId}/foods/${row.id}`} className="ui-link">
                    {row.name}
                  </Link>
                  {row.servingDescription ? (
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {row.servingDescription}
                    </div>
                  ) : null}
                </Td>
                <Td label="Source">{row.origin === "custom" ? "Custom" : foodSourceShortLabel(row.source)}</Td>
                <Td label="Category">{row.category ?? "—"}</Td>
                <Td label="Reference">
                  {row.referenceQuantity} {unitLabel(row.referenceUnit)}
                </Td>
                <Td label="Calories">{fmtNutrient(row.presentedNutrition.energyKcal)} kcal</Td>
                <Td label="Protein">{fmtNutrient(row.presentedNutrition.proteinG)}g</Td>
                <Td label="Type">
                  {row.origin === "custom" ? (
                    <Badge tone="accent">Custom</Badge>
                  ) : (
                    <Badge tone="neutral">Catalog</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <p className="ui-row" style={{ marginTop: 16 }}>
        <span className="ui-muted">
          Page {data?.page ?? page} of {totalPages} ({data?.total ?? 0} foods)
        </span>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </p>
    </section>
  );
}
