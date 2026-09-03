"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  LoadingState,
  Section,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { AdminPage } from "../_components/admin-page";
import { featureLabel, statusLabel } from "../../../lib/admin-labels";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";

interface FeatureRow {
  id: string;
  key: string;
  name: string;
  valueType: string;
  status: string;
}

export default function AdminFeaturesPage() {
  const [rows, setRows] = useState<FeatureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await api<FeatureRow[]>("/api/v1/admin/features"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load entitlements"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    setError(null);
    try {
      await api(`/api/v1/admin/features/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update entitlement"));
    }
  }

  return (
    <AdminPage
      eyebrow="Product"
      title="Entitlements"
      description="Global catalog first, then plan defaults, then a clinic override. Turning a key off here denies it everywhere."
      error={error}
      actions={
        <Link href="/admin/features/new" className="ui-btn ui-btn--primary ui-btn--sm">
          Add entitlement
        </Link>
      }
    >
      <Section title="Catalog">
        {rows === null ? <LoadingState>Loading entitlements…</LoadingState> : null}
        {rows && rows.length === 0 ? (
          <EmptyState title="No entitlements yet">Create a key to define plan capabilities.</EmptyState>
        ) : null}
        {rows && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Entitlement</th>
                <th>Type</th>
                <th>Global status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td label="Entitlement">
                    <strong>{row.name || featureLabel(row.key)}</strong>
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {featureLabel(row.key)}
                    </div>
                  </Td>
                  <Td label="Type">{humanizeLabel(row.valueType)}</Td>
                  <Td label="Global status">
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </Td>
                  <Td label="Actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(row.id, row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                    >
                      {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Section>
    </AdminPage>
  );
}
