"use client";

import { useEffect, useState } from "react";
import {
  Alert,
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

  useEffect(() => {
    void api<FoodSourceRow[]>("/api/v1/admin/food-sources")
      .then(setRows)
      .catch((err) => setError(errorMessage(err, "Unable to load food sources")));
  }, []);

  return (
    <section>
      <PageHeader
        eyebrow="Catalog"
        title="Food database"
        description="Read-only dataset visibility. Global foods are changed by the import command, not by dietitian APIs."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Food sources">
        {rows === null ? <LoadingState>Loading food sources…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No food sources">Import a dataset to populate the catalog.</EmptyState>
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

      {rows && rows.length > 0 ? (
        <Section title="Source details" tone="muted">
          {rows.map((row) => (
            <details key={row.id} className="ui-admin-details">
              <summary>
                Technical details — {row.name}
              </summary>
              <p className="ui-muted" style={{ marginTop: 8 }}>
                Provider: {row.provider}
              </p>
            </details>
          ))}
        </Section>
      ) : null}
    </section>
  );
}
