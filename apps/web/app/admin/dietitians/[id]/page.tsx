"use client";

import { useEffect, useState } from "react";
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
  Select,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { featureLabel, statusLabel } from "../../../../lib/admin-labels";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface Plan {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface Entitlement {
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT";
  enabled: boolean;
  limit: number | null;
  source: string;
  planEnabled: boolean | null;
  planLimit: number | null;
  overrideEnabled: boolean | null;
  overrideLimit: number | null;
  overrideReason: string | null;
}

interface DietitianDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription: {
    id: string;
    status: string;
    accessState?: string;
    currentPeriodEnd?: string | null;
    clientCount?: number | null;
    clientLimit?: number | null;
    plan: Plan;
  } | null;
  entitlements: Entitlement[];
}

function formatValue(enabled: boolean | null, limit: number | null): string {
  if (enabled === null && limit === null) return "—";
  const flag = enabled === null ? "" : enabled ? "On" : "Off";
  return limit === null ? flag || "—" : `${flag} · ${limit}`.trim();
}

function AiUsageCard({ dietitianAccountId }: { dietitianAccountId: string }) {
  const [usage, setUsage] = useState<{
    requests?: { used: number; limit: number | null };
    tokens?: { used: number; limit: number | null };
    costUsd?: number;
  } | null>(null);

  useEffect(() => {
    void api<{
      requests?: { used: number; limit: number | null };
      tokens?: { used: number; limit: number | null };
      costUsd?: number;
    }>(`/api/v1/admin/dietitians/${dietitianAccountId}/ai/usage`)
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [dietitianAccountId]);

  if (!usage) return null;
  return (
    <Section
      title="AI usage"
      description="This calendar month."
      actions={
        <Link href="/admin/ai" className="ui-link">
          Platform usage
        </Link>
      }
    >
      <p className="ui-muted" style={{ margin: 0 }}>
        {usage.requests?.used ?? 0}
        {usage.requests?.limit != null ? ` / ${usage.requests.limit}` : ""} requests
        {" · "}
        {(usage.tokens?.used ?? 0).toLocaleString()}
        {usage.tokens?.limit != null ? ` / ${usage.tokens.limit.toLocaleString()}` : ""} tokens
        {" · "}${(usage.costUsd ?? 0).toFixed(4)}
      </p>
    </Section>
  );
}

function defaultPeriodEndIso(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 16);
}

export default function AdminDietitianDetailPage() {
  const params = useParams<{ id: string }>();
  const dietitianAccountId = params.id;
  const [dietitian, setDietitian] = useState<DietitianDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEndIso());
  const [reason, setReason] = useState("Admin override");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [detail, catalog] = await Promise.all([
        api<DietitianDetail>(`/api/v1/admin/dietitians/${dietitianAccountId}`),
        api<Plan[]>("/api/v1/admin/plans"),
      ]);
      setDietitian(detail);
      setPlans(catalog.filter((plan) => plan.status === "ACTIVE"));
      setPlanId(detail.subscription?.plan.id ?? catalog.find((plan) => plan.slug === "standard")?.id ?? "");
      if (detail.subscription?.currentPeriodEnd) {
        setPeriodEnd(detail.subscription.currentPeriodEnd.slice(0, 16));
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load dietitian"));
    }
  }

  useEffect(() => {
    void load();
  }, [dietitianAccountId]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  if (!dietitian && !error) {
    return <LoadingState>Loading dietitian…</LoadingState>;
  }

  if (!dietitian) {
    return (
      <section>
        <PageHeader title="Dietitian" description="Unable to load this dietitian." />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Link href="/admin/dietitians" className="ui-link">
          Back to dietitians
        </Link>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        eyebrow="Platform"
        title={dietitian.name}
        description={`${dietitian.slug} · Clinic ${statusLabel(dietitian.status)} · ${dietitian.subscription?.plan.name ?? "No plan"}`}
        actions={
          <Link href="/admin/dietitians" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <AiUsageCard dietitianAccountId={dietitianAccountId} />

      <Section title="Clinic status" tone="mint">
        <div className="ui-row" style={{ marginBottom: 12 }}>
          <StatusBadge status={dietitian.status} label={statusLabel(dietitian.status)} />
          {dietitian.subscription ? (
            <StatusBadge status={dietitian.subscription.status} label={`Subscription · ${statusLabel(dietitian.subscription.status)}`} />
          ) : null}
        </div>
        <div className="ui-admin-actions">
          <Button disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/status`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) }).then(() => undefined), "Unable to activate")}>
            Activate
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/status`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) }).then(() => undefined), "Unable to suspend")}>
            Suspend
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/status`, { method: "PATCH", body: JSON.stringify({ status: "ARCHIVED" }) }).then(() => undefined), "Unable to archive")}>
            Archive
          </Button>
        </div>
      </Section>

      <Section title="Subscription">
        {dietitian.subscription ? (
          <p className="ui-muted" style={{ marginBottom: 12 }}>
            Access: <strong>{dietitian.subscription.accessState ?? "—"}</strong>
            {" · "}
            Clients: {dietitian.subscription.clientCount ?? "—"}
            {dietitian.subscription.clientLimit != null ? ` / ${dietitian.subscription.clientLimit}` : " / unlimited"}
            {" · "}
            Period end: {dietitian.subscription.currentPeriodEnd ?? "Open-ended"}
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, {
                  method: "PUT",
                  body: JSON.stringify({
                    planId,
                    status: "ACTIVE",
                    currentPeriodEnd: periodEnd ? new Date(periodEnd).toISOString() : null,
                  }),
                }).then(() => undefined),
              "Unable to assign plan",
            );
          }}
          className="ui-admin-toolbar"
        >
          <Field label="Plan">
            <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period end (UTC)">
            <Input
              type="datetime-local"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            Assign plan
          </Button>
        </form>
        <div className="ui-admin-actions">
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription/renew`, {
                    method: "POST",
                    body: JSON.stringify({
                      planId: planId || undefined,
                      currentPeriodEnd: periodEnd ? new Date(periodEnd).toISOString() : null,
                    }),
                  }).then(() => undefined),
                "Unable to renew",
              )
            }
          >
            Renew / reactivate
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) }).then(() => undefined), "Unable to reactivate")}>
            Set ACTIVE
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) }).then(() => undefined), "Unable to suspend subscription")}>
            Suspend subscription
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }).then(() => undefined), "Unable to cancel subscription")}>
            Cancel subscription
          </Button>
        </div>
      </Section>

      <Section title="Effective entitlements" description="Plan defaults with optional clinic overrides.">
        <Field label="Override reason">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Plan</th>
              <th>Override</th>
              <th>Effective</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dietitian.entitlements.map((row) => (
              <tr key={row.key}>
                <Td label="Feature">
                  <strong>{row.name || featureLabel(row.key)}</strong>
                </Td>
                <Td label="Plan">{formatValue(row.planEnabled, row.planLimit)}</Td>
                <Td label="Override">
                  {row.overrideEnabled === null && row.overrideLimit === null
                    ? "—"
                    : formatValue(row.overrideEnabled, row.overrideLimit)}
                </Td>
                <Td label="Effective">{formatValue(row.enabled, row.limit)}</Td>
                <Td label="Source">{humanizeLabel(row.source)}</Td>
                <Td label="Actions">
                  <div className="ui-admin-actions" style={{ margin: 0 }}>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        let limitValue: number | null = null;
                        if (row.valueType === "LIMIT") {
                          // Plan-disabled limits are often 0; copying that on Enable locks the clinic at zero slots.
                          const suggested =
                            row.limit != null && row.limit > 0
                              ? row.limit
                              : row.planLimit != null && row.planLimit > 0
                                ? row.planLimit
                                : 10;
                          const next = window.prompt(`Set limit for ${row.name || featureLabel(row.key)}`, String(suggested));
                          if (next === null) return;
                          const parsed = Number(next);
                          if (!Number.isFinite(parsed) || parsed < 1) {
                            setError("Limit must be a positive number");
                            return;
                          }
                          limitValue = parsed;
                        }
                        void run(
                          () =>
                            api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, {
                              method: "PUT",
                              body: JSON.stringify({ enabled: true, limitValue, reason }),
                            }).then(() => undefined),
                          "Unable to enable",
                        );
                      }}
                    >
                      Enable
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, { method: "PUT", body: JSON.stringify({ enabled: false, limitValue: row.limit, reason }) }).then(() => undefined), "Unable to disable")}>
                      Disable
                    </Button>
                    {row.valueType === "LIMIT" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          const next = window.prompt("Limit", String(row.limit ?? 0));
                          if (next === null) return;
                          void run(
                            () =>
                              api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, {
                                method: "PUT",
                                body: JSON.stringify({ enabled: row.enabled, limitValue: Number(next), reason }),
                              }).then(() => undefined),
                            "Unable to set limit",
                          );
                        }}
                      >
                        Limit
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, { method: "DELETE" }).then(() => undefined), "Unable to remove override")}>
                      Remove
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </section>
  );
}
