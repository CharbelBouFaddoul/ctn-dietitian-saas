"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Field,
  Input,
  LineChart,
  Section,
  Select,
} from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";
import { addLocalDays, localDateKey } from "../lib/local-date";

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
  const [rangePreset, setRangePreset] = useState<"7" | "30" | "90" | "all" | "custom">("all");
  const [measureType, setMeasureType] = useState("WEIGHT");
  const [measureValue, setMeasureValue] = useState("");
  const [measureUnit, setMeasureUnit] = useState("kg");
  const [measureAt, setMeasureAt] = useState(() => localDateKey());
  const [saving, setSaving] = useState(false);

  async function load() {
    const query = new URLSearchParams();
    // Local calendar keys → inclusive UTC day bounds (avoids Date("YYYY-MM-DD") quirks).
    if (from) query.set("from", `${from}T00:00:00.000Z`);
    if (to) query.set("to", `${to}T23:59:59.999Z`);
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

  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? metric;

  function defaultUnit(type: string) {
    if (type === "WEIGHT" || type === "MUSCLE_MASS") return "kg";
    if (type === "BODY_FAT") return "%";
    return "cm";
  }

  function applyPreset(preset: "7" | "30" | "90" | "all") {
    setRangePreset(preset);
    if (preset === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const days = Number(preset);
    const today = localDateKey();
    setFrom(addLocalDays(today, -(days - 1)));
    setTo(today);
  }

  return (
    <div className="ui-evo">
      <div className="ui-evo__toolbar">
        <Field label="Metric">
          <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="ui-evo__ranges" role="group" aria-label="Date range">
          {(
            [
              { id: "7", label: "7d" },
              { id: "30", label: "30d" },
              { id: "90", label: "90d" },
              { id: "all", label: "All" },
            ] as const
          ).map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={rangePreset === preset.id ? "primary" : "secondary"}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setRangePreset("custom");
              setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setRangePreset("custom");
              setTo(e.target.value);
            }}
          />
        </Field>
      </div>

      <div className="ui-evo__main">
        <Section
          className="ui-evo__chart"
          title={`${metricLabel} trend`}
          description={
            points.length > 0
              ? `${points.length} reading${points.length === 1 ? "" : "s"} in range`
              : "Add measurements to see a trend."
          }
          tone="mint"
        >
          <LineChart
            points={points}
            unit={unit}
            height={240}
            emptyTitle="Add measurements to see a trend chart."
          />
        </Section>

        <aside className="ui-evo__aside">
          <div className="ui-evo__stat">
            <span className="ui-evo__stat-label">Current</span>
            <strong className="ui-evo__stat-value">
              {latest ? `${latest.value} ${"unit" in latest ? latest.unit : unit}` : "—"}
            </strong>
            {latest && "measuredAt" in latest ? (
              <span className="ui-muted">{formatDate(latest.measuredAt)}</span>
            ) : latest && "at" in latest ? (
              <span className="ui-muted">{formatDate((latest as { at: string }).at)}</span>
            ) : null}
          </div>
          <div className="ui-evo__stat">
            <span className="ui-evo__stat-label">Previous</span>
            <strong className="ui-evo__stat-value">
              {previous ? `${previous.value} ${"unit" in previous ? previous.unit : unit}` : "—"}
            </strong>
          </div>
          {(["weight", "height", "bmi"] as const).map((key) => {
            const row = data?.comparison[key];
            return (
              <div key={key} className="ui-evo__stat">
                <span className="ui-evo__stat-label">{key}</span>
                <strong className="ui-evo__stat-value">
                  {row ? (
                    <>
                      {row.baseline.value}
                      <span className="ui-evo__stat-arrow">→</span>
                      {row.current.value}
                      <span className="ui-muted" style={{ fontWeight: 500, fontSize: "0.85em" }}>
                        {" "}
                        {row.current.unit}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </strong>
                {row ? (
                  <span className="ui-muted">
                    Δ {row.absolute >= 0 ? "+" : ""}
                    {row.absolute}
                    {row.percent != null ? ` (${row.percent >= 0 ? "+" : ""}${row.percent}%)` : ""}
                  </span>
                ) : null}
              </div>
            );
          })}
        </aside>
      </div>

      {allowManage ? (
        <Section title="Record measurement" description="Adds to this client’s measurement history.">
          <form
            className="ui-evo__form"
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
            <div className="ui-evo__form-action">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Section>
      ) : null}
    </div>
  );
}
