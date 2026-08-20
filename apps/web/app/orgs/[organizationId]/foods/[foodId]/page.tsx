"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
type NutrientKey =
  | "energyKcal"
  | "proteinG"
  | "carbohydrateG"
  | "fatG"
  | "fiberG"
  | "sugarG"
  | "sodiumMg";

interface NutritionValues {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

interface EffectiveFood {
  id: string;
  name: string;
  category: string | null;
  servingDescription: string | null;
  referenceQuantity: number;
  referenceUnit: string;
  sourceFoodId: string;
  source: {
    name: string;
    provider: string;
    datasetVersion: string;
    license: string;
    attribution: string;
  };
  globalNutrition: NutritionValues;
  effectiveNutrition: NutritionValues;
  presentedEffectiveNutrition: NutritionValues;
  overriddenFields: NutrientKey[];
  override: { id: string; status: string } | null;
}

interface CalculateResult {
  nutrition: NutritionValues;
  presented: NutritionValues;
}

const NUTRIENTS: Array<{ key: NutrientKey; label: string; unit: string }> = [
  { key: "energyKcal", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbohydrateG", label: "Carbohydrates", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sugarG", label: "Sugar", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
];

function formatValue(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

export default function FoodDetailPage() {
  const params = useParams<{ organizationId: string; foodId: string }>();
  const { organizationId, foodId } = params;
  const [food, setFood] = useState<EffectiveFood | null>(null);
  const [role, setRole] = useState<string>("");
  const [draft, setDraft] = useState<Record<NutrientKey, string>>({
    energyKcal: "",
    proteinG: "",
    carbohydrateG: "",
    fatG: "",
    fiberG: "",
    sugarG: "",
    sodiumMg: "",
  });
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [calculated, setCalculated] = useState<CalculateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canOverride = role === "OWNER" || role === "DIETITIAN";

  async function load() {
    setError(null);
    const [detail, org] = await Promise.all([
      api<EffectiveFood>(`/api/v1/organizations/${organizationId}/foods/${foodId}`),
      api<{ role: string }>(`/api/v1/organizations/${organizationId}`),
    ]);
    setFood(detail);
    setRole(org.role);
    const next = { ...draft };
    for (const item of NUTRIENTS) {
      const overridden = detail.overriddenFields.includes(item.key);
      next[item.key] = overridden ? String(detail.effectiveNutrition[item.key] ?? "") : "";
    }
    setDraft(next);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Unable to load food"));
  }, [organizationId, foodId]);

  async function saveOverride(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const body: Partial<Record<NutrientKey, number | null>> = {};
    for (const item of NUTRIENTS) {
      const raw = draft[item.key].trim();
      if (raw === "") {
        if (food?.overriddenFields.includes(item.key)) {
          body[item.key] = null;
        }
      } else {
        body[item.key] = Number(raw);
      }
    }
    await api(`/api/v1/organizations/${organizationId}/foods/${foodId}/override`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setNotice("Organization override saved. The global food was not changed.");
    await load();
  }

  async function resetOverride() {
    setError(null);
    setNotice(null);
    await api(`/api/v1/organizations/${organizationId}/foods/${foodId}/override`, { method: "DELETE" });
    setNotice("Override removed. Effective values are global again.");
    await load();
  }

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await api<CalculateResult>(
      `/api/v1/organizations/${organizationId}/foods/${foodId}/calculate`,
      {
        method: "POST",
        body: JSON.stringify({ quantity: Number(quantity), unit }),
      },
    );
    setCalculated(result);
  }

  if (!food) {
    return <section>{error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : <p>Loading food…</p>}</section>;
  }

  return (
    <section>
      <p>
        <Link href={`/orgs/${organizationId}/foods`} style={{ color: "var(--color-accent)" }}>
          Back to foods
        </Link>
      </p>
      <h1>{food.name}</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Reference: {food.referenceQuantity} {food.referenceUnit}
        {food.servingDescription ? ` · ${food.servingDescription}` : ""}
        {food.category ? ` · ${food.category}` : ""}
      </p>
      <p>
        Values marked <strong>Practice food</strong> are organization overrides. <strong>Catalog food</strong> values come from the
        imported dataset and cannot be edited in place.
      </p>
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      {notice ? <p>{notice}</p> : null}

      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--color-surface)" }}>
        <thead>
          <tr>
            <th style={th}>Nutrient</th>
            <th style={th}>Effective</th>
            <th style={th}>Global</th>
            <th style={th}>Origin</th>
            {canOverride ? <th style={th}>Override</th> : null}
          </tr>
        </thead>
        <tbody>
          {NUTRIENTS.map((item) => {
            const custom = food.overriddenFields.includes(item.key);
            return (
              <tr key={item.key}>
                <td style={td}>
                  {item.label} ({item.unit})
                </td>
                <td style={td}>{formatValue(food.presentedEffectiveNutrition[item.key])}</td>
                <td style={td}>{formatValue(food.globalNutrition[item.key])}</td>
                <td style={td}>{custom ? "Practice food" : "Catalog food"}</td>
                {canOverride ? (
                  <td style={td}>
                    <input
                      className="ui-input"
                      value={draft[item.key]}
                      placeholder="global"
                      onChange={(event) => setDraft((current) => ({ ...current, [item.key]: event.target.value }))}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canOverride ? (
        <form onSubmit={(event) => void saveOverride(event).catch((err) => setError(err instanceof Error ? err.message : "Save failed"))} style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button type="submit" className="ui-btn ui-btn--primary">
            Save organization override
          </button>
          {food.override ? (
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => void resetOverride().catch((err) => setError(err instanceof Error ? err.message : "Reset failed"))}>
              Remove override
            </button>
          ) : null}
        </form>
      ) : (
        <p style={{ color: "var(--color-muted)" }}>Staff can view effective nutrition but cannot create overrides.</p>
      )}

      <h2 style={{ marginTop: 32 }}>Quantity calculation</h2>
      <p style={{ color: "var(--color-muted)" }}>Calculated by the API nutrition engine using effective values.</p>
      <form
        onSubmit={(event) => void calculate(event).catch((err) => setError(err instanceof Error ? err.message : "Calculate failed"))}
        style={{ display: "flex", gap: 12, alignItems: "end" }}
      >
        <label className="ui-field">
          Quantity
          <input className="ui-input" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="ui-field">
          Unit
          <select className="ui-input" value={unit} onChange={(event) => setUnit(event.target.value)}>
            {(food.referenceUnit === "g" ? ["g", "kg", "oz", "lb"] : ["ml", "l", "fl_oz"]).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-btn ui-btn--primary" style={{height: 38}}>
          Calculate
        </button>
      </form>
      {calculated ? (
        <p>
          {formatValue(calculated.presented.energyKcal)} kcal · P {formatValue(calculated.presented.proteinG)} · C{" "}
          {formatValue(calculated.presented.carbohydrateG)} · F {formatValue(calculated.presented.fatG)} · Fiber{" "}
          {formatValue(calculated.presented.fiberG)}
        </p>
      ) : null}

      <h2>Source</h2>
      <p>
        {food.source.name} · {food.source.provider} · version {food.source.datasetVersion}
      </p>
      <p>Source food ID: {food.sourceFoodId}</p>
      <p style={{ fontSize: 13, color: "var(--color-muted)" }}>{food.source.attribution}</p>
      <p style={{ fontSize: 13, color: "var(--color-muted)" }}>{food.source.license}</p>
    </section>
  );
}

const th: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid var(--color-border)",
  padding: "0.6rem 0.75rem",
  fontSize: 13,
};

const td: CSSProperties = {
  borderBottom: "1px solid var(--color-border)",
  padding: "0.6rem 0.75rem",
  fontSize: 14,
};
