"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { errorMessage } from "../../../lib/humanize-error";

interface ImportReport {
  processed?: number;
  imported?: number;
  updated?: number;
  skipped?: number;
  rejected?: number;
  suspiciousCalorieGaps?: number;
}

interface FoodSourceRow {
  id: string;
  name: string;
  provider: string;
  datasetVersion: string;
  license: string;
  status: string;
  importedAt: string;
  foodCount: number;
  lastImportReport: ImportReport | null;
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

export default function AdminFoodSourcesPage() {
  const [rows, setRows] = useState<FoodSourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const [q, setQ] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<CatalogListResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const catalogQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sourceId) p.set("sourceId", sourceId);
    p.set("page", String(page));
    p.set("pageSize", "25");
    return p.toString();
  }, [q, sourceId, page]);

  async function loadSources() {
    setRows(await api<FoodSourceRow[]>("/api/v1/admin/food-sources"));
  }

  async function loadCatalog() {
    setCatalogError(null);
    setCatalog(await api<CatalogListResponse>(`/api/v1/admin/food-sources/foods?${catalogQuery}`));
  }

  useEffect(() => {
    void loadSources().catch((err) => setError(errorMessage(err, "Unable to load food sources")));
  }, []);

  useEffect(() => {
    void loadCatalog().catch((err) => setCatalogError(errorMessage(err, "Unable to load catalog foods")));
  }, [catalogQuery]);

  async function runCuratedImport() {
    setImportBusy(true);
    setError(null);
    setNotice(null);
    try {
      const report = await api<ImportReport>("/api/v1/admin/food-sources/import", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice(
        `Curated catalog import finished: ${report.processed ?? 0} processed · ${report.imported ?? 0} imported · ${report.updated ?? 0} updated · ${report.rejected ?? 0} rejected`,
      );
      await loadSources();
      setPage(1);
      await loadCatalog();
    } catch (err) {
      setError(errorMessage(err, "Import failed"));
    } finally {
      setImportBusy(false);
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    void loadCatalog().catch((err) => setCatalogError(errorMessage(err, "Unable to load catalog foods")));
  }

  const totalPages = catalog ? Math.max(1, Math.ceil(catalog.total / catalog.pageSize)) : 1;
  const items = catalog?.items ?? [];

  return (
    <section>
      <PageHeader
        eyebrow="Catalog"
        title="Food database"
        description="Platform-admin catalog sources and global foods. Import uses the bundled curated Foundation dataset (no remote URL fetch). Dietitians cannot mutate global foods."
        actions={
          <Button disabled={importBusy} onClick={() => void runCuratedImport()}>
            {importBusy ? "Importing…" : "Import curated catalog"}
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Section title="Food sources">
        {rows === null ? <LoadingState>Loading food sources…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No food sources">
            Import the curated dataset (`pnpm food:import` or the button above) to populate the catalog.
          </EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Version</th>
                <th>Status</th>
                <th>Foods</th>
                <th>Imported</th>
                <th>Last import</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Source">
                    <strong>{row.name}</strong>
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {row.license}
                    </div>
                  </Td>
                  <Td label="Version">{row.datasetVersion}</Td>
                  <Td label="Status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Foods">{row.foodCount}</Td>
                  <Td label="Imported">{formatDate(row.importedAt)}</Td>
                  <Td label="Last import">
                    {row.lastImportReport
                      ? `${row.lastImportReport.processed ?? 0} processed · ${row.lastImportReport.imported ?? 0} imported · ${row.lastImportReport.updated ?? 0} updated · ${row.lastImportReport.rejected ?? 0} rejected`
                      : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>

      <Section title="Catalog foods" description="Read-only browse of global catalog foods (practice customs are not listed here).">
        {catalogError ? <Alert tone="danger">{catalogError}</Alert> : null}
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
              {(rows ?? []).map((row) => (
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

        {catalog === null && !catalogError ? <LoadingState>Loading foods…</LoadingState> : null}
        {catalog && items.length === 0 ? (
          <EmptyState title={q ? "No foods match this search" : "No catalog foods yet"}>
            {q ? "Try a different search term." : "Import the curated catalog to populate foods."}
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

        {catalog && catalog.total > 0 ? (
          <p className="ui-row" style={{ marginTop: 16 }}>
            <span className="ui-muted">
              Page {catalog.page} of {totalPages} ({catalog.total} foods)
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
        ) : null}
      </Section>
    </section>
  );
}
