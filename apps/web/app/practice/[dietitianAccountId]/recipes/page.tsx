"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { statusLabel } from "../../../../lib/practice-labels";

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
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    p.set("page", String(page));
    p.set("pageSize", "20");
    return p.toString();
  }, [q, status, page]);

  async function load() {
    setError(null);
    try {
      setData(await api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/recipes?${query}`));
    } catch (err) {
      setError(errorMessage(err, "Unable to load recipes"));
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

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const items = data?.items ?? [];

  return (
    <section>
      <PageHeader
        title="Recipes"
        description="Organization recipes. Nutrition is calculated from effective foods."
        actions={
          <Link href={`/practice/${dietitianAccountId}/recipes/new`} className="ui-btn ui-btn--secondary">
            New recipe
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
            placeholder="Recipe name…"
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
            <option value="">All</option>
          </Select>
        </Field>
        <div className="ui-inline-form__action">
          <Button type="submit">Apply filters</Button>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title={q ? "No recipes match this search" : "No recipes yet"}
          action={
            !q ? (
              <Link href={`/practice/${dietitianAccountId}/recipes/new`} className="ui-btn ui-btn--primary">
                Create first recipe
              </Link>
            ) : undefined
          }
        >
          {q ? "Try a different search term." : "Create your first recipe to get started."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Servings</th>
              <th>Ingredients</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <Td label="Recipe">
                  <Link href={`/practice/${dietitianAccountId}/recipes/${row.id}`} className="ui-link">
                    {row.name}
                  </Link>
                </Td>
                <Td label="Servings">{row.servings}</Td>
                <Td label="Ingredients">{row.ingredientCount}</Td>
                <Td label="Status">
                  <StatusBadge status={row.status} label={statusLabel(row.status)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {data && data.total > data.pageSize ? (
        <p className="ui-row" style={{ marginTop: 16 }}>
          Page {data.page} of {pageCount} ({data.total} total)
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
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </p>
      ) : null}
    </section>
  );
}
