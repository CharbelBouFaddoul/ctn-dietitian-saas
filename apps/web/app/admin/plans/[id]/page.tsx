"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
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
      setError(err instanceof Error ? err.message : "Unable to load plan");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function setStatus(status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
    await api(`/api/v1/admin/plans/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function saveFeatures(event: FormEvent) {
    event.preventDefault();
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
  }

  if (!plan) {
    return <p>{error ?? "Loading…"}</p>;
  }

  return (
    <section>
      <h1>{plan.name}</h1>
      <p>
        {plan.slug} · {plan.status} · {plan._count?.subscriptions ?? 0} subscriptions
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => void setStatus("ACTIVE")}>
          Activate
        </button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => void setStatus("INACTIVE")}>
          Deactivate
        </button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => void setStatus("ARCHIVED")}>
          Archive
        </button>
      </div>
      <form onSubmit={(event) => void saveFeatures(event)}>
        <table className="ui-table">
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
                <td>
                  {feature.key} ({feature.valueType})
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={rows[feature.id]?.enabled ?? false}
                    onChange={(event) =>
                      setRows((current) => ({
                        ...current,
                        [feature.id]: { ...current[feature.id], enabled: event.target.checked, limitValue: current[feature.id]?.limitValue ?? "" },
                      }))
                    }
                  />
                </td>
                <td>
                  {feature.valueType === "LIMIT" ? (
                    <input
                      className="ui-input"
                      type="number"
                      min={0}
                      value={rows[feature.id]?.limitValue ?? ""}
                      onChange={(event) =>
                        setRows((current) => ({
                          ...current,
                          [feature.id]: { enabled: current[feature.id]?.enabled ?? false, limitValue: event.target.value },
                        }))
                      }
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="ui-btn ui-btn--primary" style={{marginTop: 12}}>
          Save plan features
        </button>
      </form>
    </section>
  );
}
