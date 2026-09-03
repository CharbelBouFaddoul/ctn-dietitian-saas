"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
  StatusBadge,
  Table,
  Td,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { AdminDetail, AdminMetaList } from "../../_components/admin-detail";
import { AdminLimitDialog } from "../../_components/admin-limit-dialog";
import { AdminPage } from "../../_components/admin-page";
import { ClinicPatientsPanel, type ClinicPatient } from "./clinic-patients-panel";
import { featureLabel, scopedStatusLabel } from "../../../../lib/admin-labels";
import { api } from "../../../../lib/api";
import { formatDate } from "../../../../lib/format";
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
  createdAt?: string;
  owner: {
    id: string;
    email: string;
    status: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  subscription: {
    id: string;
    status: string;
    accessState?: string;
    currentPeriodEnd?: string | null;
    clientCount?: number | null;
    clientLimit?: number | null;
    plan: Plan;
  } | null;
  patientCount?: number;
  entitlements: Entitlement[];
}

interface ClinicAiUsage {
  enabled: boolean;
  periodKey: string;
  requests: { used: number; limit: number | null; remaining: number | null };
  tokens: { used: number; limit: number | null };
  costUsd: number;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "patients", label: "Patients" },
  { id: "subscription", label: "Subscription" },
  { id: "entitlements", label: "Entitlements" },
  { id: "access", label: "Access" },
];

function formatValue(enabled: boolean | null, limit: number | null): string {
  if (enabled === null && limit === null) return "—";
  const flag = enabled === null ? "" : enabled ? "On" : "Off";
  return limit === null ? flag || "—" : `${flag} · ${limit}`.trim();
}

function defaultPeriodEndIso(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 16);
}

function ClinicDetailBody() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dietitianAccountId = params.id;
  const tabParam = searchParams.get("tab");
  const tab = TABS.some((item) => item.id === tabParam) ? tabParam! : "overview";

  const [dietitian, setDietitian] = useState<DietitianDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEndIso());
  const [reason, setReason] = useState("Admin override");
  const [aiUsage, setAiUsage] = useState<ClinicAiUsage | null>(null);
  const [patients, setPatients] = useState<ClinicPatient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limitTarget, setLimitTarget] = useState<{ key: string; name: string; enabled: boolean; suggested: number } | null>(
    null,
  );

  function setTab(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", id);
    router.replace(`/admin/dietitians/${dietitianAccountId}?${next.toString()}`, { scroll: false });
  }

  async function load() {
    try {
      const [detail, catalog, roster] = await Promise.all([
        api<DietitianDetail>(`/api/v1/admin/dietitians/${dietitianAccountId}`),
        api<Plan[]>("/api/v1/admin/plans"),
        api<{ items: ClinicPatient[] }>(`/api/v1/admin/dietitians/${dietitianAccountId}/clients`),
      ]);
      setDietitian(detail);
      setPlans(catalog.filter((plan) => plan.status === "ACTIVE"));
      setPlanId(detail.subscription?.plan.id ?? catalog.find((plan) => plan.slug === "standard")?.id ?? "");
      if (detail.subscription?.currentPeriodEnd) {
        setPeriodEnd(detail.subscription.currentPeriodEnd.slice(0, 16));
      }
      setPatients(roster.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load clinic"));
    }

    try {
      setAiUsage(await api<ClinicAiUsage>(`/api/v1/admin/dietitians/${dietitianAccountId}/ai/usage`));
    } catch {
      setAiUsage(null);
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

  function suggestedLimit(row: Entitlement): number {
    if (row.limit != null && row.limit > 0) return row.limit;
    if (row.planLimit != null && row.planLimit > 0) return row.planLimit;
    return 10;
  }

  if (!dietitian && !error) {
    return <LoadingState>Loading clinic…</LoadingState>;
  }

  if (!dietitian) {
    return (
      <AdminPage title="Clinic" description="Unable to load this clinic." error={error}>
        <Link href="/admin/dietitians" className="ui-link">
          Back to clinics
        </Link>
      </AdminPage>
    );
  }

  const ownerName = [dietitian.owner?.firstName, dietitian.owner?.lastName].filter(Boolean).join(" ");
  const activePatientCount = dietitian.patientCount ?? 0;
  const tabs = TABS.map((item) =>
    item.id === "patients" ? { ...item, label: `Patients (${activePatientCount})` } : item,
  );

  return (
    <AdminPage
      eyebrow="People"
      title={dietitian.name}
      description={`${dietitian.slug} · ${dietitian.subscription?.plan.name ?? "No plan"}`}
      error={error}
      crumbs={[
        { href: "/admin/dietitians", label: "Clinics" },
        { label: dietitian.name },
      ]}
      actions={
        <Link href="/admin/dietitians" className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to clinics
        </Link>
      }
    >
      <AdminDetail
        tabs={tabs}
        tab={tab}
        onTabChange={setTab}
      >
        {tab === "overview" ? (
          <>
            <Section title="Clinic status" tone="mint">
              <div className="ui-admin-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api(`/api/v1/admin/dietitians/${dietitianAccountId}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "ACTIVE" }),
                        }).then(() => undefined),
                      "Unable to activate",
                    )
                  }
                >
                  Activate clinic
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api(`/api/v1/admin/dietitians/${dietitianAccountId}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "SUSPENDED" }),
                        }).then(() => undefined),
                      "Unable to suspend",
                    )
                  }
                >
                  Suspend clinic
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api(`/api/v1/admin/dietitians/${dietitianAccountId}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "ARCHIVED" }),
                        }).then(() => undefined),
                      "Unable to archive",
                    )
                  }
                >
                  Archive clinic
                </Button>
              </div>
            </Section>
            <Section title="AI usage this period" description="Per-clinic request and token usage.">
              {aiUsage ? (
                <AdminMetaList
                  rows={[
                    { label: "Period", value: aiUsage.periodKey },
                    {
                      label: "Requests",
                      value:
                        aiUsage.requests.limit == null
                          ? String(aiUsage.requests.used)
                          : `${aiUsage.requests.used} / ${aiUsage.requests.limit}`,
                    },
                    { label: "Tokens", value: aiUsage.tokens.used.toLocaleString() },
                    { label: "Estimated cost", value: `$${aiUsage.costUsd.toFixed(4)}` },
                    { label: "AI entitlement", value: aiUsage.enabled ? "On" : "Off" },
                  ]}
                />
              ) : (
                <p className="ui-muted">AI usage is not available for this clinic.</p>
              )}
            </Section>
          </>
        ) : null}

        {tab === "patients" ? (
          <ClinicPatientsPanel
            dietitianAccountId={dietitianAccountId}
            patients={patients}
            activeCount={activePatientCount}
          />
        ) : null}

        {tab === "subscription" ? (
          <Section title="Subscription" description="Assign, renew, or change access for this clinic.">
            {dietitian.subscription ? (
              <p className="ui-muted" style={{ marginBottom: 12 }}>
                Access: <strong>{dietitian.subscription.accessState ?? "—"}</strong>
                {" · "}
                Clients: {dietitian.subscription.clientCount ?? "—"}
                {dietitian.subscription.clientLimit != null ? ` / ${dietitian.subscription.clientLimit}` : " / unlimited"}
                {" · "}
                Period end: {dietitian.subscription.currentPeriodEnd ?? "Open-ended"}
              </p>
            ) : (
              <p className="ui-muted" style={{ marginBottom: 12 }}>
                This clinic has no subscription yet.
              </p>
            )}
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
                <Input type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
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
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "ACTIVE" }),
                      }).then(() => undefined),
                    "Unable to reactivate",
                  )
                }
              >
                Set subscription active
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "SUSPENDED" }),
                      }).then(() => undefined),
                    "Unable to suspend subscription",
                  )
                }
              >
                Suspend subscription
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api(`/api/v1/admin/dietitians/${dietitianAccountId}/subscription`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "CANCELLED" }),
                      }).then(() => undefined),
                    "Unable to cancel subscription",
                  )
                }
              >
                Cancel subscription
              </Button>
            </div>
          </Section>
        ) : null}

        {tab === "entitlements" ? (
          <Section
            title="Effective entitlements"
            description="Global catalog, then plan defaults, then clinic overrides. An override only applies to this clinic."
          >
            <Field label="Override reason">
              <Input value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <Table>
              <thead>
                <tr>
                  <th>Entitlement</th>
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
                    <Td label="Entitlement">
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
                            if (row.valueType === "LIMIT") {
                              setLimitTarget({
                                key: row.key,
                                name: row.name || featureLabel(row.key),
                                enabled: true,
                                suggested: suggestedLimit(row),
                              });
                              return;
                            }
                            void run(
                              () =>
                                api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ enabled: true, limitValue: null, reason }),
                                }).then(() => undefined),
                              "Unable to enable",
                            );
                          }}
                        >
                          Enable
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, {
                                  method: "PUT",
                                  body: JSON.stringify({ enabled: false, limitValue: row.limit, reason }),
                                }).then(() => undefined),
                              "Unable to disable",
                            )
                          }
                        >
                          Disable
                        </Button>
                        {row.valueType === "LIMIT" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              setLimitTarget({
                                key: row.key,
                                name: row.name || featureLabel(row.key),
                                enabled: row.enabled,
                                suggested: suggestedLimit(row),
                              })
                            }
                          >
                            Limit
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${row.key}`, {
                                  method: "DELETE",
                                }).then(() => undefined),
                              "Unable to remove override",
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        ) : null}

        {tab === "access" ? (
          <Section title="Owner login" description="The dietitian account that owns this clinic.">
            {dietitian.owner ? (
              <AdminMetaList
                rows={[
                  {
                    label: "Name",
                    value: ownerName || "—",
                  },
                  {
                    label: "Email",
                    value: (
                      <Link href={`/admin/users/${dietitian.owner.id}`} className="ui-link">
                        {dietitian.owner.email}
                      </Link>
                    ),
                  },
                  {
                    label: "Login status",
                    value: (
                      <StatusBadge
                        status={dietitian.owner.status}
                        label={scopedStatusLabel("login", dietitian.owner.status)}
                      />
                    ),
                  },
                ]}
              />
            ) : (
              <p className="ui-muted">No owner login is linked to this clinic.</p>
            )}
          </Section>
        ) : null}
      </AdminDetail>

      <AdminLimitDialog
        open={Boolean(limitTarget)}
        title={limitTarget ? `Set limit for ${limitTarget.name}` : "Set limit"}
        description="Plan-disabled limits are often 0. Set the clinic override to a positive number."
        initialValue={limitTarget?.suggested ?? 10}
        pending={busy}
        confirmLabel="Save override"
        onClose={() => setLimitTarget(null)}
        onSubmit={(value) => {
          if (!limitTarget) return;
          const key = limitTarget.key;
          const enabled = limitTarget.enabled;
          setLimitTarget(null);
          void run(
            () =>
              api(`/api/v1/admin/dietitians/${dietitianAccountId}/overrides/${key}`, {
                method: "PUT",
                body: JSON.stringify({ enabled, limitValue: value, reason }),
              }).then(() => undefined),
            "Unable to set limit",
          );
        }}
      />
    </AdminPage>
  );
}

export default function AdminDietitianDetailPage() {
  return (
    <Suspense fallback={<LoadingState>Loading clinic…</LoadingState>}>
      <ClinicDetailBody />
    </Suspense>
  );
}
