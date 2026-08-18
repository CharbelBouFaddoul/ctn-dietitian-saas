"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, fieldStyle, inputStyle, tableStyle } from "../practice-shell";

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
        <label style={fieldStyle}>
          Search
          <input style={inputStyle} value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          Status
          <select style={inputStyle} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <button type="submit" style={{ ...buttonStyle, height: 38 }}>
          Search
        </button>
      </form>
      <table style={{ ...tableStyle, marginTop: 16 }}>
        <thead>
          <tr>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Servings</th>
            <th style={cellStyle}>Ingredients</th>
            <th style={cellStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>
                <Link href={`/orgs/${organizationId}/recipes/${row.id}`} style={{ color: "var(--color-accent)" }}>
                  {row.name}
                </Link>
              </td>
              <td style={cellStyle}>{row.servings}</td>
              <td style={cellStyle}>{row.ingredientCount}</td>
              <td style={cellStyle}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
