"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@nutrition-saas/ui";
import { FilterPopover, ListFilters, ListPager, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
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

const RECIPE_STATUS = [
  { id: "ACTIVE", label: "Active" },
  { id: "ARCHIVED", label: "Archived" },
  { id: "", label: "All statuses" },
] as const;

export default function RecipesPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (status) p.set("status", status);
    p.set("page", String(page));
    p.set("pageSize", "20");
    return p.toString();
  }, [search, status, page]);

  async function load() {
    setError(null);
    try {
      setData(await api<ListResponse>(`/api/v1/dietitian/${dietitianAccountId}/recipes?${query}`));
    } catch (err) {
      setError(errorMessage(err, "Unable to load meal library"));
    }
  }

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft]);

  useEffect(() => {
    void load();
  }, [query, dietitianAccountId]);

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
  const hasFilters = Boolean(search || status !== "ACTIVE");
  const statusTrigger = RECIPE_STATUS.find((item) => item.id === status)?.label;

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setStatus("ACTIVE");
    setPage(1);
  }

  return (
    <section className="ui-list-page">
      <PageHeader
        eyebrow="Nutrition"
        title="Meal library"
        description="Reusable meals from the platform Starter catalog and your clinic library. Nutrition is calculated from foods automatically."
        actions={
          <Link href={`/practice/${dietitianAccountId}/recipes/new`} className="ui-btn ui-btn--primary">
            New reusable meal
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search meals"
        hasFilters={hasFilters}
        onClear={clearFilters}
        count={data?.total ?? 0}
        countNoun="meal"
        loading={!data && !error}
      >
        <FilterPopover
          label="Filter by status"
          value={status === "ACTIVE" ? "Status" : statusTrigger ?? "Status"}
          active={status !== "ACTIVE"}
          searchPlaceholder="Search status"
          onSelect={(id) => {
            setStatus(id);
            setPage(1);
          }}
          items={RECIPE_STATUS.map((item) => ({
            id: item.id,
            label: item.label,
            active: status === item.id,
          }))}
        />
      </ListFilters>

      <div className="ui-list-results">
        {items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No meals match this search" : "Your meal library is empty"}
            action={
              !hasFilters ? (
                <Link href={`/practice/${dietitianAccountId}/recipes/new`} className="ui-btn ui-btn--primary">
                  Create first meal
                </Link>
              ) : (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          >
            {hasFilters
              ? "Try a different name or clear filters."
              : "Create a reusable meal once, then add it to breakfasts, lunches, and snacks across plans."}
          </EmptyState>
        ) : (
          <ul className="ui-list-cards">
            {items.map((row) => {
              const origin = row.origin === "starter" ? "Starter" : "Clinic";
              const summary = [
                origin,
                `${row.servings} serving${row.servings === 1 ? "" : "s"}`,
                `${row.ingredientCount} ingredient${row.ingredientCount === 1 ? "" : "s"}`,
              ].join(" · ");
              const blurb = row.description
                ? row.description.length > 80
                  ? `${row.description.slice(0, 80)}…`
                  : row.description
                : null;
              return (
                <li key={row.id}>
                  <article className="ui-list-cards__item">
                    <Link
                      href={`/practice/${dietitianAccountId}/recipes/${row.id}`}
                      className="ui-list-cards__main"
                      title={row.name}
                    >
                      <strong>{row.name}</strong>
                      <p>{blurb ? `${summary} · ${blurb}` : summary}</p>
                    </Link>
                    <div className="ui-list-cards__aside">
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                      {row.status === "ACTIVE" && !row.readOnly ? (
                        <div className="ui-list-cards__actions">
                          <button
                            type="button"
                            className="ui-list-cards__action is-danger"
                            disabled={busyId === row.id}
                            onClick={() => void archiveRecipe(row.id, row.name)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        <ListPager
          page={page}
          pageCount={pageCount}
          onPrev={() => setPage((current) => current - 1)}
          onNext={() => setPage((current) => current + 1)}
        />
      </div>
    </section>
  );
}
