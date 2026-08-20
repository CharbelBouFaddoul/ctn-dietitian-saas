"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
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

function formatNutrient(value: number | null): string {
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
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (sourceId) params.set("sourceId", sourceId);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
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
      setError(err instanceof Error ? err.message : "Unable to load foods");
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

  return (
    <section>
      <h1>Food database</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Search the internal catalog. Changing a food creates an organization override; the global record is never
        edited.
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <form onSubmit={onSearch} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12 }}>
        <label className="ui-field">
          Search
          <input className="ui-input" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <label className="ui-field">
          Category
          <select className="ui-input" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">All</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          Source
          <select className="ui-input" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(1); }}>
            <option value="">All</option>
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-btn ui-btn--primary" style={{alignSelf: "end", height: 38}}>
          Search
        </button>
      </form>
      <table className="ui-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>kcal</th>
            <th>Protein</th>
            <th>Source</th>
            <th>Values</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/orgs/${organizationId}/foods/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>
              </td>
              <td>{row.category ?? "—"}</td>
              <td>
                {formatNutrient(row.presentedNutrition.energyKcal)} / {row.referenceQuantity} {row.referenceUnit}
              </td>
              <td>{formatNutrient(row.presentedNutrition.proteinG)}</td>
              <td>{row.source.name}</td>
              <td>{row.hasOverride ? "Practice food" : "Catalog food"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" className="ui-btn ui-btn--primary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
          Previous
        </button>
        <span>
          Page {data?.page ?? page} of {totalPages} ({data?.total ?? 0} foods)
        </span>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={page >= totalPages}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </p>
    </section>
  );
}
