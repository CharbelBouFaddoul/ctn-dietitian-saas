"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { FilterPopover, ListFilters, ListPager, LIST_SEARCH_DEBOUNCE_MS } from "../../../../components/list-filters";
import { FoodInformationDialog } from "../../../../components/food-information-dialog";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { foodSourceShortLabel } from "../../../../lib/food-source-label";
import { unitLabel } from "../../../../lib/practice-labels";
import { usePractice } from "../practice-shell";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const practice = usePractice();
  const selectedFoodId = searchParams.get("food");
  const canMutate = practice.role === "OWNER" || practice.role === "DIETITIAN";
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
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
    if (search) p.set("q", search);
    if (category) p.set("category", category);
    if (activeSourceId) p.set("sourceId", activeSourceId);
    if (originFilter && originFilter !== "all") p.set("origin", originFilter);
    p.set("page", String(page));
    p.set("pageSize", "25");
    return p.toString();
  }, [search, category, activeSourceId, originFilter, page]);

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

  function openFood(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("food", id);
    router.replace(`/practice/${dietitianAccountId}/foods?${next.toString()}`, { scroll: false });
  }

  function closeFood() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("food");
    const query = next.toString();
    router.replace(`/practice/${dietitianAccountId}/foods${query ? `?${query}` : ""}`, { scroll: false });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const items = data?.items ?? [];
  const hasFilters = Boolean(
    search || category || activeSourceId || (originFilter && originFilter !== "all"),
  );
  const selectedSource = sources.find((item) => item.id === sourceId);
  const originTrigger =
    originFilter === "catalog" ? "Catalog" : originFilter === "custom" ? "Custom" : "Origin";

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setCategory("");
    setSourceId("");
    setOrigin("all");
    setPage(1);
  }

  return (
    <section className="ui-list-page">
      <PageHeader
        title="Food database"
        description="Search catalog sources separately (USDA Foundation, USDA SR Legacy, CNF, McCance and Widdowson) or your clinic custom foods. Catalog foods are read-only; duplicate one to edit a clinic copy."
        actions={
          <Link href={`/practice/${dietitianAccountId}/foods/new`} className="ui-btn ui-btn--primary ui-btn--sm">
            New custom food
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search foods"
        hasFilters={hasFilters}
        onClear={clearFilters}
        count={data?.total ?? 0}
        countNoun="food"
        loading={!data && !error}
      >
        <FilterPopover
          label="Filter by origin"
          value={originTrigger}
          active={originFilter !== "all"}
          searchPlaceholder="Search origin"
          onSelect={(id) => {
            setOrigin(id);
            if (id === "custom") setSourceId("");
            setPage(1);
          }}
          items={[
            { id: "all", label: "All origins", active: originFilter === "all" },
            ...(showCatalogOrigin
              ? [{ id: "catalog", label: "Catalog", active: originFilter === "catalog" }]
              : []),
            { id: "custom", label: "Custom", active: originFilter === "custom" },
          ]}
        />
        <FilterPopover
          label="Filter by category"
          value={category || "Category"}
          active={Boolean(category)}
          searchPlaceholder="Search categories"
          onSelect={(id) => {
            setCategory(id);
            setPage(1);
          }}
          items={[
            { id: "", label: "All categories", active: !category },
            ...categories.map((item) => ({
              id: item,
              label: item,
              active: category === item,
            })),
          ]}
        />
        {showSourceFilter ? (
          <FilterPopover
            label="Filter by source"
            value={selectedSource ? foodSourceShortLabel(selectedSource) : "Source"}
            active={Boolean(sourceId)}
            searchPlaceholder="Search sources"
            onSelect={(id) => {
              setSourceId(id);
              setPage(1);
            }}
            items={[
              { id: "", label: "All sources", active: !sourceId },
              ...sources.map((item) => ({
                id: item.id,
                label:
                  item.foodCount != null
                    ? `${foodSourceShortLabel(item)} (${item.foodCount})`
                    : foodSourceShortLabel(item),
                active: sourceId === item.id,
              })),
            ]}
          />
        ) : null}
      </ListFilters>

      <div className="ui-list-results">
        {items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No foods match this search" : "No foods found"}
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            {hasFilters ? "Try a different search term or clear filters." : "No foods available for this source or category."}
          </EmptyState>
        ) : (
          <div className="ui-list-table">
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
                  <tr key={row.id} className="ui-foods__row" onClick={() => openFood(row.id)}>
                    <Td label="Food">
                      <strong>{row.name}</strong>
                      {row.servingDescription ? (
                        <div className="ui-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {row.servingDescription}
                        </div>
                      ) : null}
                    </Td>
                    <Td label="Source">{row.origin === "custom" ? "Custom" : foodSourceShortLabel(row.source)}</Td>
                    <Td label="Category">{row.category ?? "—"}</Td>
                    <Td label="Reference">
                      {row.referenceQuantity} {unitLabel(row.referenceUnit)}
                    </Td>
                    <Td label="Calories">
                      <span className="ui-list-table__num">{fmtNutrient(row.presentedNutrition.energyKcal)}</span>
                      {row.presentedNutrition.energyKcal !== null ? " kcal" : ""}
                    </Td>
                    <Td label="Protein">
                      <span className="ui-list-table__num">{fmtNutrient(row.presentedNutrition.proteinG)}</span>
                      {row.presentedNutrition.proteinG !== null ? "g" : ""}
                    </Td>
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
          </div>
        )}
        <ListPager
          page={data?.page ?? page}
          pageCount={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      </div>

      {selectedFoodId ? (
        <FoodInformationDialog
          foodId={selectedFoodId}
          dietitianAccountId={dietitianAccountId}
          canMutate={canMutate}
          onClose={closeFood}
          onChanged={() => void load()}
          onFoodIdChange={openFood}
        />
      ) : null}
    </section>
  );
}
