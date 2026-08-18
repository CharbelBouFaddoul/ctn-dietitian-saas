"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { buttonStyle, cellStyle, inputStyle, tableStyle } from "../../admin-shell";

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

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription: { id: string; status: string; plan: Plan } | null;
  entitlements: Entitlement[];
}

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const organizationId = params.id;
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [reason, setReason] = useState("Admin override");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [detail, catalog] = await Promise.all([
        api<OrgDetail>(`/api/v1/admin/organizations/${organizationId}`),
        api<Plan[]>("/api/v1/admin/plans"),
      ]);
      setOrg(detail);
      setPlans(catalog.filter((plan) => plan.status === "ACTIVE"));
      setPlanId(detail.subscription?.plan.id ?? catalog.find((plan) => plan.slug === "standard")?.id ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load organization");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId]);

  async function setOrgStatus(status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    await api(`/api/v1/admin/organizations/${organizationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function assignPlan(event: FormEvent) {
    event.preventDefault();
    await api(`/api/v1/admin/organizations/${organizationId}/subscription`, {
      method: "PUT",
      body: JSON.stringify({ planId, status: "ACTIVE" }),
    });
    await load();
  }

  async function setSubStatus(status: "ACTIVE" | "SUSPENDED" | "CANCELLED") {
    await api(`/api/v1/admin/organizations/${organizationId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function saveOverride(key: string, enabled: boolean | null, limitValue: number | null) {
    await api(`/api/v1/admin/organizations/${organizationId}/overrides/${key}`, {
      method: "PUT",
      body: JSON.stringify({ enabled, limitValue, reason }),
    });
    await load();
  }

  async function removeOverride(key: string) {
    await api(`/api/v1/admin/organizations/${organizationId}/overrides/${key}`, { method: "DELETE" });
    await load();
  }

  if (!org) {
    return <p>{error ?? "Loading…"}</p>;
  }

  return (
    <section>
      <h1>{org.name}</h1>
      <p>
        {org.slug} · org {org.status} · subscription {org.subscription?.status ?? "none"} ·{" "}
        {org.subscription?.plan.name ?? "no plan"}
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" style={buttonStyle} onClick={() => void setOrgStatus("ACTIVE")}>
          Activate org
        </button>
        <button type="button" style={buttonStyle} onClick={() => void setOrgStatus("SUSPENDED")}>
          Suspend org
        </button>
        <button type="button" style={buttonStyle} onClick={() => void setOrgStatus("ARCHIVED")}>
          Archive org
        </button>
      </div>
      <form onSubmit={(event) => void assignPlan(event)} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select style={inputStyle} value={planId} onChange={(event) => setPlanId(event.target.value)}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle}>
          Assign plan
        </button>
      </form>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button type="button" style={buttonStyle} onClick={() => void setSubStatus("ACTIVE")}>
          Reactivate subscription
        </button>
        <button type="button" style={buttonStyle} onClick={() => void setSubStatus("SUSPENDED")}>
          Suspend subscription
        </button>
        <button type="button" style={buttonStyle} onClick={() => void setSubStatus("CANCELLED")}>
          Cancel subscription
        </button>
      </div>
      <h2>Effective entitlements</h2>
      <label style={{ display: "block", marginBottom: 12 }}>
        Override reason
        <input style={{ ...inputStyle, marginLeft: 8 }} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Feature</th>
            <th style={cellStyle}>Plan</th>
            <th style={cellStyle}>Override</th>
            <th style={cellStyle}>Effective</th>
            <th style={cellStyle}>Source</th>
            <th style={cellStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {org.entitlements.map((row) => (
            <tr key={row.key}>
              <td style={cellStyle}>{row.key}</td>
              <td style={cellStyle}>
                {formatValue(row.planEnabled, row.planLimit)}
              </td>
              <td style={cellStyle}>
                {row.overrideEnabled === null && row.overrideLimit === null
                  ? "—"
                  : formatValue(row.overrideEnabled, row.overrideLimit)}
              </td>
              <td style={cellStyle}>{formatValue(row.enabled, row.limit)}</td>
              <td style={cellStyle}>{row.source}</td>
              <td style={cellStyle}>
                <button type="button" style={buttonStyle} onClick={() => void saveOverride(row.key, true, row.valueType === "LIMIT" ? row.limit ?? 0 : null)}>
                  Enable
                </button>{" "}
                <button type="button" style={buttonStyle} onClick={() => void saveOverride(row.key, false, row.limit)}>
                  Disable
                </button>{" "}
                {row.valueType === "LIMIT" ? (
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => {
                      const next = window.prompt("Limit", String(row.limit ?? 0));
                      if (next === null) {
                        return;
                      }
                      void saveOverride(row.key, row.enabled, Number(next));
                    }}
                  >
                    Limit
                  </button>
                ) : null}{" "}
                <button type="button" style={buttonStyle} onClick={() => void removeOverride(row.key)}>
                  Remove override
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatValue(enabled: boolean | null, limit: number | null): string {
  if (enabled === null && limit === null) {
    return "—";
  }
  const flag = enabled === null ? "" : enabled ? "on" : "off";
  return limit === null ? flag || "—" : `${flag} ${limit}`.trim();
}
