"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LineChart,
  Section,
  Select,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";

type EvolutionResponse = {
  series: Record<string, Array<{ at: string; value: number; unit: string; id: string }>>;
  bmiSeries: Array<{ at: string; value: number; unit: string }>;
  latest: Record<string, { value: number; unit: string; measuredAt: string } | null>;
  previous: Record<string, { value: number; unit: string; measuredAt: string } | null>;
  comparison: {
    weight: Comparison | null;
    height: Comparison | null;
    bmi: Comparison | null;
    available: boolean;
  };
};

type Comparison = {
  baseline: { value: number; unit: string; measuredAt: string };
  current: { value: number; unit: string; measuredAt: string };
  absolute: number;
  percent: number | null;
};

const METRICS = [
  { id: "WEIGHT", label: "Weight" },
  { id: "HEIGHT", label: "Height" },
  { id: "BMI", label: "BMI" },
  { id: "WAIST", label: "Waist" },
  { id: "HIPS", label: "Hips" },
  { id: "BODY_FAT", label: "Body fat" },
  { id: "MUSCLE_MASS", label: "Muscle mass" },
] as const;

type Props = {
  base: string;
  allowManage: boolean;
  onError: (message: string) => void;
};

export function ClientEvolutionPanel({ base, allowManage, onError }: Props) {
  const [data, setData] = useState<EvolutionResponse | null>(null);
  const [metric, setMetric] = useState<string>("WEIGHT");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [measureType, setMeasureType] = useState("WEIGHT");
  const [measureValue, setMeasureValue] = useState("");
  const [measureUnit, setMeasureUnit] = useState("kg");
  const [measureAt, setMeasureAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function load() {
    const query = new URLSearchParams();
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
    const qs = query.toString();
    const row = await api<EvolutionResponse>(`${base}/evolution${qs ? `?${qs}` : ""}`);
    setData(row);
  }

  useEffect(() => {
    void load().catch((err) => onError(errorMessage(err, "Unable to load evolution")));
  }, [base, from, to]);

  const points = useMemo(() => {
    if (!data) return [];
    if (metric === "BMI") {
      return data.bmiSeries.map((p) => ({ at: p.at, value: p.value }));
    }
    return (data.series[metric] ?? []).map((p) => ({ at: p.at, value: p.value }));
  }, [data, metric]);

  const unit =
    metric === "BMI"
      ? "kg/m²"
      : data?.series[metric]?.[0]?.unit ??
        (metric === "WEIGHT" || metric === "MUSCLE_MASS" ? "kg" : metric === "BODY_FAT" ? "%" : "cm");

  const latest = metric === "BMI" ? data?.bmiSeries.at(-1) : data?.latest[metric];
  const previous =
    metric === "BMI"
      ? data?.bmiSeries.length && data.bmiSeries.length >= 2
        ? data.bmiSeries[data.bmiSeries.length - 2]
        : null
      : data?.previous[metric];

  function defaultUnit(type: string) {
    if (type === "WEIGHT" || type === "MUSCLE_MASS") return "kg";
    if (type === "BODY_FAT") return "%";
    return "cm";
  }

  return (
    <div className="ui-client-chart__panel ui-stack">
      <Section title="Filters">
        <div className="ui-client-chart__toolbar">
          <Field label="Metric">
            <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Section>

      <div className="ui-client-chart__metrics">
        <div className="ui-client-chart__metric">
          <span className="ui-client-chart__metric-label">Current</span>
          <span className="ui-client-chart__metric-value">
            {latest ? `${latest.value} ${"unit" in latest ? latest.unit : unit}` : "—"}
          </span>
          {latest && "measuredAt" in latest ? (
            <span className="ui-muted">{formatDate(latest.measuredAt)}</span>
          ) : latest && "at" in latest ? (
            <span className="ui-muted">{formatDate((latest as { at: string }).at)}</span>
          ) : null}
        </div>
        <div className="ui-client-chart__metric">
          <span className="ui-client-chart__metric-label">Previous</span>
          <span className="ui-client-chart__metric-value">
            {previous ? `${previous.value} ${"unit" in previous ? previous.unit : unit}` : "—"}
          </span>
        </div>
      </div>

      <Section title={`${METRICS.find((m) => m.id === metric)?.label ?? metric} over time`}>
        <LineChart points={points} unit={unit} emptyTitle="Add measurements to see a trend chart." />
      </Section>

      <Section title="Baseline vs current">
        {!data?.comparison.available ? (
          <EmptyState title="Comparison unavailable">
            Need at least two weight readings (or BMI points) in range.
          </EmptyState>
        ) : (
          <div className="ui-client-chart__metrics">
            {(["weight", "height", "bmi"] as const).map((key) => {
              const row = data.comparison[key];
              if (!row) {
                return (
                  <div key={key} className="ui-client-chart__metric">
                    <span className="ui-client-chart__metric-label">{key.toUpperCase()}</span>
                    <span className="ui-client-chart__metric-value">—</span>
                  </div>
                );
              }
              return (
                <div key={key} className="ui-client-chart__metric">
                  <span className="ui-client-chart__metric-label">{key.toUpperCase()}</span>
                  <span className="ui-client-chart__metric-value">
                    {row.baseline.value} → {row.current.value} {row.current.unit}
                  </span>
                  <span className="ui-muted">
                    Δ {row.absolute >= 0 ? "+" : ""}
                    {row.absolute}
                    {row.percent != null ? ` (${row.percent >= 0 ? "+" : ""}${row.percent}%)` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {allowManage ? (
        <Section title="Record measurement">
          <form
            className="ui-client-chart__toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(measureValue);
              if (!Number.isFinite(value)) return;
              setSaving(true);
              void api(`${base}/measurements`, {
                method: "POST",
                body: JSON.stringify({
                  type: measureType,
                  value,
                  unit: measureUnit,
                  measuredAt: new Date(`${measureAt}T12:00:00.000Z`).toISOString(),
                }),
              })
                .then(() => {
                  setMeasureValue("");
                  return load();
                })
                .catch((err) => onError(errorMessage(err, "Unable to save measurement")))
                .finally(() => setSaving(false));
            }}
          >
            <Field label="Type">
              <Select
                value={measureType}
                onChange={(e) => {
                  setMeasureType(e.target.value);
                  setMeasureUnit(defaultUnit(e.target.value));
                }}
              >
                {METRICS.filter((m) => m.id !== "BMI").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Value">
              <Input
                type="number"
                step="any"
                value={measureValue}
                onChange={(e) => setMeasureValue(e.target.value)}
                required
              />
            </Field>
            <Field label="Unit">
              <Input value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)} required />
            </Field>
            <Field label="Date">
              <Input type="date" value={measureAt} onChange={(e) => setMeasureAt(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </form>
        </Section>
      ) : null}
    </div>
  );
}
