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
  Section,
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
  description?: string | null;
  origin?: "starter" | "practice";
  readOnly?: boolean;
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
  const [busyId, setBusyId] = useState<string | null>(null);

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
      setError(errorMessage(err, "Unable to load meal library"));
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

  async function archiveRecipe(id: string, name: string) {
    if (!window.confirm(`Delete “${name}” from the meal library? It will be archived and hidden from active plans.`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/recipes/${id}/archive`, { method: "POST" });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not delete recipe"));
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const items = data?.items ?? [];

  return (
    <section className="ui-stack" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Nutrition"
        title="Meal library"
        description="Reusable meals from the platform Starter catalog and your practice library. Nutrition is calculated from foods automatically."
        actions={
          <Link href={`/practice/${dietitianAccountId}/recipes/new`} className="ui-btn ui-btn--primary">
            New reusable meal
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Find meals" tone="muted">
        <form onSubmit={onSearch} className="ui-inline-form">
          <Field label="Search">
            <input
              className="ui-input"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search by name…"
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
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
        </form>
      </Section>

      <Section
        title="Reusable meals"
        description={data ? `${data.total} meal${data.total === 1 ? "" : "s"}` : undefined}
      >
        {items.length === 0 ? (
          <EmptyState
            title={q ? "No meals match this search" : "Your meal library is empty"}
            action={
              !q ? (
                <Link href={`/practice/${dietitianAccountId}/recipes/new`} className="ui-btn ui-btn--primary">
                  Create first meal
                </Link>
              ) : undefined
            }
          >
            {q
              ? "Try a different name or clear filters."
              : "Create a reusable meal once, then add it to breakfasts, lunches, and snacks across plans."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Meal</th>
                <th>Origin</th>
                <th>Servings</th>
                <th>Ingredients</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <Td label="Meal">
                    <Link href={`/practice/${dietitianAccountId}/recipes/${row.id}`} className="ui-link">
                      <strong>{row.name}</strong>
                    </Link>
                    {row.description ? (
                      <div className="ui-muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {row.description.length > 80 ? `${row.description.slice(0, 80)}…` : row.description}
                      </div>
                    ) : null}
                  </Td>
                  <Td label="Origin">
                    <Badge tone={row.origin === "starter" ? "info" : "neutral"}>
                      {row.origin === "starter" ? "Starter" : "Practice"}
                    </Badge>
                  </Td>
                  <Td label="Servings">{row.servings}</Td>
                  <Td label="Ingredients">{row.ingredientCount}</Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Actions">
                    <div className="ui-row" style={{ gap: 8, justifyContent: "flex-end" }}>
                      <Link
                        href={`/practice/${dietitianAccountId}/recipes/${row.id}`}
                        className="ui-btn ui-btn--secondary ui-btn--sm"
                      >
                        Open
                      </Link>
                      {row.status === "ACTIVE" && !row.readOnly ? (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => void archiveRecipe(row.id, row.name)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {data && data.total > data.pageSize ? (
          <p className="ui-row" style={{ marginTop: 16 }}>
            <span className="ui-muted">
              Page {data.page} of {pageCount}
            </span>
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
      </Section>
    </section>
  );
}
