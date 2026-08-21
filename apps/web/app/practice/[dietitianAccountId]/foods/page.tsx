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
  hasOverride: boolean;
  presentedNutrition: NutritionValues;
  source: { name: string };
}

interface ListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: FoodRow[];
}

interface FoodSource {
  id: string;
  name: string;
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
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (sourceId) p.set("sourceId", sourceId);
    if (origin && origin !== "all") p.set("origin", origin);
    p.set("page", String(page));
    p.set("pageSize", "25");
    return p.toString();
  }, [q, category, sourceId, origin, page]);

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
        description="Search the global catalog and your clinic custom foods. Catalog overrides never change the shared dataset."
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
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="catalog">Catalog</option>
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
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
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
                <Td label="Category">{row.category ?? "—"}</Td>
                <Td label="Reference">
                  {row.referenceQuantity} {unitLabel(row.referenceUnit)}
                </Td>
                <Td label="Calories">{fmtNutrient(row.presentedNutrition.energyKcal)} kcal</Td>
                <Td label="Protein">{fmtNutrient(row.presentedNutrition.proteinG)}g</Td>
                <Td label="Type">
                  {row.origin === "custom" ? (
                    <Badge tone="accent">Custom</Badge>
                  ) : row.hasOverride ? (
                    <Badge tone="warning">Overridden</Badge>
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
