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
  priceCents: number | null;
  currency: string;
  showPrice: boolean;
  listedPublicly: boolean;
  durationDays: number;
  planFeatures: Array<{ featureId: string; enabled: boolean; limitValue: number | null; feature: Feature }>;
  _count?: { subscriptions: number };
}

export default function AdminPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [rows, setRows] = useState<Record<string, { enabled: boolean; limitValue: string }>>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [showPrice, setShowPrice] = useState(true);
  const [listedPublicly, setListedPublicly] = useState(true);
  const [durationDays, setDurationDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [detail, catalog] = await Promise.all([
        api<PlanDetail>(`/api/v1/admin/plans/${params.id}`),
        api<Feature[]>("/api/v1/admin/features"),
      ]);
      setPlan(detail);
      setName(detail.name);
      setDescription(detail.description ?? "");
      setPrice(detail.priceCents == null ? "" : (detail.priceCents / 100).toFixed(2));
      setCurrency(detail.currency || "USD");
      setShowPrice(detail.showPrice);
      setListedPublicly(detail.listedPublicly !== false);
      setDurationDays(String(detail.durationDays ?? 30));
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

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const priceCents = price.trim() === "" ? null : Math.round(Number(price) * 100);
      if (price.trim() !== "" && Number.isNaN(priceCents)) {
        throw new Error("Enter a valid price");
      }
      await api(`/api/v1/admin/plans/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          priceCents,
          currency: currency.trim() || "USD",
          showPrice,
          listedPublicly,
          durationDays: Number(durationDays) || 30,
        }),
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to save plan details"));
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
        description={`${plan.slug} · ${plan._count?.subscriptions ?? 0} subscriptions · ${plan.durationDays} day period`}
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

      <Section title="Plan details" description="Pricing and duration shown on the public Plans page (price optional).">
        <form onSubmit={(event) => void saveDetails(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Price">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="e.g. 49.00"
            />
          </Field>
          <Field label="Currency">
            <Input value={currency} onChange={(event) => setCurrency(event.target.value)} />
          </Field>
          <Field label="Duration (days)">
            <Input
              type="number"
              min={1}
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              required
            />
          </Field>
          <label className="ui-row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} />
            <span>Show price on public Plans page</span>
          </label>
          <label className="ui-row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={listedPublicly} onChange={(event) => setListedPublicly(event.target.checked)} />
            <span>List on public Plans page</span>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save plan details"}
          </Button>
        </form>
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
