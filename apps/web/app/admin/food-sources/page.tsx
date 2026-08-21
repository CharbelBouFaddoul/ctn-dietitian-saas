"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  Section,
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

export default function AdminFoodSourcesPage() {
  const [rows, setRows] = useState<FoodSourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  async function loadSources() {
    setRows(await api<FoodSourceRow[]>("/api/v1/admin/food-sources"));
  }

  useEffect(() => {
    void loadSources().catch((err) => setError(errorMessage(err, "Unable to load food sources")));
  }, []);

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

  return (
    <section>
      <PageHeader
        eyebrow="Catalog"
        title="Food database"
        description="Platform-admin catalog sources. Import uses the bundled curated Foundation dataset (no remote URL fetch). Dietitians cannot mutate global foods."
        actions={
          <div className="ui-row">
            <Link href="/admin/food-sources/foods" className="ui-btn ui-btn--secondary ui-btn--sm">
              Browse foods
            </Link>
            <Button disabled={importBusy} onClick={() => void runCuratedImport()}>
              {importBusy ? "Importing…" : "Import curated catalog"}
            </Button>
          </div>
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
    </section>
  );
}
