"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
interface RecipeRow {
  id: string;
  name: string;
  servings: number;
  status: string;
  ingredientCount: number;
}

interface ListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: RecipeRow[];
}

export default function RecipesPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [q, status, page]);

  async function load() {
    setError(null);
    try {
      setData(await api<ListResponse>(`/api/v1/organizations/${organizationId}/recipes?${query}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load recipes");
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

  return (
    <section>
      <h1>Recipes</h1>
      <p style={{ color: "var(--color-muted)" }}>Organization recipes. Nutrition is calculated from effective foods.</p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <p>
        <Link href={`/orgs/${organizationId}/recipes/new`} style={{ color: "var(--color-accent)" }}>
          New recipe
        </Link>
      </p>
      <form onSubmit={onSearch} style={{ display: "flex", gap: 12, alignItems: "end" }}>
        <label className="ui-field">
          Search
          <input className="ui-input" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <label className="ui-field">
          Status
          <select className="ui-input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <button type="submit" className="ui-btn ui-btn--primary" style={{height: 38}}>
          Search
        </button>
      </form>
      <table className="ui-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Servings</th>
            <th>Ingredients</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/orgs/${organizationId}/recipes/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>
              </td>
              <td>{row.servings}</td>
              <td>{row.ingredientCount}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
