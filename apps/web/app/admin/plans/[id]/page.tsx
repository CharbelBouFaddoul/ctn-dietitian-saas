"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { featureLabel, statusLabel } from "../../../../lib/admin-labels";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface Feature {
  id: string;
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT";
}

interface PlanDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  planFeatures: Array<{ featureId: string; enabled: boolean; limitValue: number | null; feature: Feature }>;
  _count?: { subscriptions: number };
}

export default function AdminPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [rows, setRows] = useState<Record<string, { enabled: boolean; limitValue: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [detail, catalog] = await Promise.all([
        api<PlanDetail>(`/api/v1/admin/plans/${params.id}`),
        api<Feature[]>("/api/v1/admin/features"),
      ]);
      setPlan(detail);
      setFeatures(catalog);
      const next: Record<string, { enabled: boolean; limitValue: string }> = {};
      for (const feature of catalog) {
        const existing = detail.planFeatures.find((row) => row.featureId === feature.id);
        next[feature.id] = {
          enabled: existing?.enabled ?? false,
          limitValue: existing?.limitValue === null || existing?.limitValue === undefined ? "" : String(existing.limitValue),
        };
      }
      setRows(next);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load plan"));
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function setStatus(status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/admin/plans/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to update plan"));
    } finally {
      setBusy(false);
    }
  }

  async function saveFeatures(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/admin/plans/${params.id}/features`, {
        method: "PUT",
        body: JSON.stringify({
          features: features.map((feature) => ({
            featureId: feature.id,
            enabled: rows[feature.id]?.enabled ?? false,
            limitValue: rows[feature.id]?.limitValue === "" ? null : Number(rows[feature.id]?.limitValue),
          })),
        }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to save plan features"));
    } finally {
      setBusy(false);
    }
  }

  if (!plan && !error) {
    return <LoadingState>Loading plan…</LoadingState>;
  }

  if (!plan) {
    return (
      <section>
        <PageHeader title="Plan" description="Unable to load this plan." />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Link href="/admin/plans" className="ui-link">
          Back to plans
        </Link>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        eyebrow="Commerce"
        title={plan.name}
        description={`${plan.slug} · ${plan._count?.subscriptions ?? 0} subscriptions${plan.description ? ` · ${plan.description}` : ""}`}
        actions={
          <Link href="/admin/plans" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Plan status" tone="mint">
        <div className="ui-row" style={{ marginBottom: 12 }}>
          <StatusBadge status={plan.status} label={statusLabel(plan.status)} />
        </div>
        <div className="ui-admin-actions">
          <Button disabled={busy} onClick={() => void setStatus("ACTIVE")}>
            Activate
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void setStatus("INACTIVE")}>
            Deactivate
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void setStatus("ARCHIVED")}>
            Archive
          </Button>
        </div>
      </Section>

      <Section title="Plan features" description="Enable features and set limits for this plan.">
        <form onSubmit={(event) => void saveFeatures(event)}>
          <Table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Enabled</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr key={feature.id}>
                  <Td label="Feature">
                    <strong>{feature.name || featureLabel(feature.key)}</strong>
                    <div className="ui-muted" style={{ fontSize: 12 }}>
                      {humanizeLabel(feature.valueType)}
                    </div>
                  </Td>
                  <Td label="Enabled">
                    <input
                      type="checkbox"
                      checked={rows[feature.id]?.enabled ?? false}
                      onChange={(event) =>
                        setRows((current) => ({
                          ...current,
                          [feature.id]: {
                            ...current[feature.id],
                            enabled: event.target.checked,
                            limitValue: current[feature.id]?.limitValue ?? "",
                          },
                        }))
                      }
                    />
                  </Td>
                  <Td label="Limit">
                    {feature.valueType === "LIMIT" ? (
                      <Field label="">
                        <Input
                          type="number"
                          min={0}
                          value={rows[feature.id]?.limitValue ?? ""}
                          onChange={(event) =>
                            setRows((current) => ({
                              ...current,
                              [feature.id]: {
                                enabled: current[feature.id]?.enabled ?? false,
                                limitValue: event.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="ui-admin-actions">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save plan features"}
            </Button>
          </div>
        </form>
      </Section>
    </section>
  );
}
