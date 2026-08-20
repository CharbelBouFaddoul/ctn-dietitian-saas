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
  referenceQuantity: number;
  referenceUnit: string;
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
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sourceId, setSourceId] = useState("");
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
    p.set("page", String(page));
    p.set("pageSize", "20");
    return p.toString();
  }, [q, category, sourceId, page]);

  async function load() {
    setError(null);
    try {
      const [list, categoryRows, sourceRows] = await Promise.all([
        api<ListResponse>(`/api/v1/organizations/${organizationId}/foods?${query}`),
        api<string[]>(`/api/v1/organizations/${organizationId}/foods/categories`),
        api<FoodSource[]>(`/api/v1/organizations/${organizationId}/food-sources`),
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
  }, [query, organizationId]);

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
        description="Search the internal catalog. Editing a food creates a practice override — the global record is never changed."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form onSubmit={onSearch} className="ui-grid" style={{ margin: "20px 0", alignItems: "end" }}>
        <Field label="Search">
          <input
            className="ui-input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Food name…"
          />
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
        <div>
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
              <th>Source</th>
              <th>Values</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <Td label="Food">
                  <Link href={`/practice/${organizationId}/foods/${row.id}`} className="ui-link">
                    {row.name}
                  </Link>
                </Td>
                <Td label="Category">{row.category ?? "—"}</Td>
                <Td label="Reference">
                  {row.referenceQuantity} {unitLabel(row.referenceUnit)}
                </Td>
                <Td label="Calories">
                  {fmtNutrient(row.presentedNutrition.energyKcal)} kcal
                </Td>
                <Td label="Protein">{fmtNutrient(row.presentedNutrition.proteinG)}g</Td>
                <Td label="Source">
                  <span className="ui-muted">{row.source.name}</span>
                </Td>
                <Td label="Values">
                  {row.hasOverride ? (
                    <Badge tone="accent">Practice food</Badge>
                  ) : (
                    <Badge tone="neutral">Catalog food</Badge>
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
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
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
