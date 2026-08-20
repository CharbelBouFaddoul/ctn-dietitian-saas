"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
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
  const [rows, setRows] = useState<FoodSourceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<FoodSourceRow[]>("/api/v1/admin/food-sources")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load food sources"));
  }, []);

  return (
    <section>
      <h1>Food sources</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Read-only dataset visibility. Global foods are changed by the import command, not by dietitian APIs.
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <table className="ui-table">
        <thead>
          <tr>
            <th>Name</th>
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
              <td>
                <div>{row.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{row.provider}</div>
              </td>
              <td>{row.datasetVersion}</td>
              <td>{row.status}</td>
              <td>{row.foodCount}</td>
              <td>{new Date(row.importedAt).toLocaleString()}</td>
              <td>
                {row.lastImportReport
                  ? `${row.lastImportReport.processed ?? 0} processed · ${row.lastImportReport.imported ?? 0} imported · ${row.lastImportReport.updated ?? 0} updated · ${row.lastImportReport.rejected ?? 0} rejected`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.map((row) => (
        <p key={`${row.id}-license`} style={{ fontSize: 13, color: "var(--color-muted)" }}>
          {row.name}: {row.license}
        </p>
      ))}
    </section>
  );
}
