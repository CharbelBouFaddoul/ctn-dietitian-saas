"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  Select,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { AdminPagination } from "../../_components/admin-pagination";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface FoodSourceRow {
  id: string;
  name: string;
  status: string;
}

interface CatalogFoodRow {
  id: string;
  name: string;
  category: string | null;
  servingDescription: string | null;
  referenceQuantity: number;
  referenceUnit: string;
  presentedNutrition: {
    energyKcal: number | null;
    proteinG: number | null;
  };
  source: { id: string; name: string };
}

interface CatalogListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: CatalogFoodRow[];
}

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default function AdminCatalogFoodsPage() {
  const [sources, setSources] = useState<FoodSourceRow[]>([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<CatalogListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedQ) params.set("q", appliedQ);
    if (sourceId) params.set("sourceId", sourceId);
    params.set("page", String(page));
    params.set("pageSize", "25");
    return params.toString();
  }, [appliedQ, sourceId, page]);

  useEffect(() => {
    void api<FoodSourceRow[]>("/api/v1/admin/food-sources")
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    void api<CatalogListResponse>(`/api/v1/admin/food-sources/foods?${catalogQuery}`)
      .then((data) => {
        setCatalog(data);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load catalog foods")));
  }, [catalogQuery]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedQ(q.trim());
  }

  const items = catalog?.items ?? [];

  return (
    <section>
      <PageHeader
        eyebrow="Catalog"
        title="Catalog foods"
        description="Read-only browse of global catalog foods (practice customs are not listed here)."
        actions={
          <Link href="/admin/food-sources" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to sources
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Foods">
        <form onSubmit={onSearch} className="ui-inline-form" style={{ marginBottom: 16 }}>
          <Field label="Search">
            <input
              className="ui-input"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Food name…"
            />
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
              {sources.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="ui-inline-form__action">
            <Button type="submit">Apply filters</Button>
          </div>
        </form>

        {catalog === null && !error ? <LoadingState>Loading foods…</LoadingState> : null}
        {catalog && items.length === 0 ? (
          <EmptyState title={appliedQ ? "No foods match this search" : "No catalog foods yet"}>
            {appliedQ ? "Try a different search term." : "Import the curated catalog to populate foods."}
          </EmptyState>
        ) : null}
        {items.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Food</th>
                <th>Category</th>
                <th>Reference</th>
                <th>Calories</th>
                <th>Protein</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <Td label="Food">
                    <strong>{row.name}</strong>
                    {row.servingDescription ? (
                      <div className="ui-muted" style={{ fontSize: 12 }}>
                        {row.servingDescription}
                      </div>
                    ) : null}
                  </Td>
                  <Td label="Category">{row.category ?? "—"}</Td>
                  <Td label="Reference">
                    {row.referenceQuantity} {row.referenceUnit}
                  </Td>
                  <Td label="Calories">{fmt(row.presentedNutrition.energyKcal)} kcal</Td>
                  <Td label="Protein">{fmt(row.presentedNutrition.proteinG)}g</Td>
                  <Td label="Source">
                    <Badge tone="neutral">{row.source.name}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}

        {catalog ? (
          <AdminPagination
            page={catalog.page}
            pageSize={catalog.pageSize}
            total={catalog.total}
            onPageChange={setPage}
            label="foods"
          />
        ) : null}
      </Section>
    </section>
  );
}
