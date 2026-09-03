"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
  StatusBadge,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { AdminDetail } from "../_components/admin-detail";
import { AdminListToolbar } from "../_components/admin-list-toolbar";
import { AdminPage } from "../_components/admin-page";
import { AdminPagination } from "../_components/admin-pagination";
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

const TABS = [
  { id: "sources", label: "Sources" },
  { id: "browse", label: "Browse" },
];

function fmt(value: number | null): string {
  return value === null ? "—" : String(value);
}

function FoodDatabaseBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = tabParam === "browse" ? "browse" : "sources";

  const [rows, setRows] = useState<FoodSourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<CatalogListResponse | null>(null);

  function setTab(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", id);
    router.replace(`/admin/food-sources?${next.toString()}`, { scroll: false });
  }

  async function loadSources() {
    setRows(await api<FoodSourceRow[]>("/api/v1/admin/food-sources"));
  }

  useEffect(() => {
    void loadSources().catch((err) => setError(errorMessage(err, "Unable to load food sources")));
  }, []);

  const catalogQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedQ) params.set("q", appliedQ);
    if (sourceId) params.set("sourceId", sourceId);
    params.set("page", String(page));
    params.set("pageSize", "25");
    return params.toString();
  }, [appliedQ, sourceId, page]);

  useEffect(() => {
    if (tab !== "browse") return;
    void api<CatalogListResponse>(`/api/v1/admin/food-sources/foods?${catalogQuery}`)
      .then((data) => {
        setCatalog(data);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, "Unable to load catalog foods")));
  }, [catalogQuery, tab]);

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
    } catch (err) {
      setError(errorMessage(err, "Import failed"));
    } finally {
      setImportBusy(false);
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedQ(q.trim());
  }

  const items = catalog?.items ?? [];

  return (
    <AdminPage
      eyebrow="Data"
      title="Food database"
      description="Global catalog sources and a read-only browse of imported foods."
      error={error}
      actions={
        <Button disabled={importBusy} onClick={() => void runCuratedImport()}>
          {importBusy ? "Importing…" : "Import curated catalog"}
        </Button>
      }
    >
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <AdminDetail tabs={TABS} tab={tab} onTabChange={setTab}>
        {tab === "sources" ? (
          <Section title="Food sources">
            {rows === null ? <LoadingState>Loading food sources…</LoadingState> : null}
            {rows && rows.length === 0 ? (
              <EmptyState title="No food sources">
                Import the curated dataset to populate the catalog.
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
        ) : (
          <Section title="Catalog foods" description="Practice custom foods are not listed here.">
            <AdminListToolbar onSubmit={onSearch}>
              <Field label="Search">
                <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Food name…" />
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
              <Button type="submit">Apply filters</Button>
            </AdminListToolbar>

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
        )}
      </AdminDetail>
    </AdminPage>
  );
}

export default function AdminFoodSourcesPage() {
  return (
    <Suspense fallback={<LoadingState>Loading food database…</LoadingState>}>
      <FoodDatabaseBody />
    </Suspense>
  );
}
