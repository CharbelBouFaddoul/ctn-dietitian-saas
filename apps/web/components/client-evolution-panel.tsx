"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Field, Input, LineChart, Select } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import { formatFullDate } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";
import { localDateKey } from "../lib/local-date";
import {
  ALL_MEASUREMENT_METRICS,
  findMeasurementMetric,
  formatMeasurementValue,
  isMeasurementMetricId,
  MEASUREMENT_GROUPS,
  STORED_MEASUREMENT_METRICS,
  type MeasurementMetricId,
} from "../lib/measurements";
import {
  FACULTY_METHOD_HINT,
  FACULTY_METHOD_TITLE,
  computeFacultyIbw,
  computeFrameRatio,
  computeWhr,
  facultyFrameSize,
  isFacultyMethod,
  percentOf,
  sanitizeNutritionMethod,
  whrElevated,
  type NutritionMethod,
} from "../lib/faculty-nutrition";

type Point = { at: string; value: number; unit: string; id?: string };

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

type Props = {
  base: string;
  allowManage: boolean;
  clinicMethod?: NutritionMethod;
  allowLog?: boolean;
  enabledMeasurements?: string[] | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  onError: (message: string) => void;
  initialMetric?: string | null;
  onMetricChange?: (metric: string) => void;
};

function roundDelta(value: number) {
  return Math.round(value * 10) / 10;
}

function unitLabel(unit: string) {
  if (unit === "kg") return "kilogram";
  if (unit === "lb") return "pound";
  if (unit === "cm") return "centimeter";
  if (unit === "in") return "inch";
  return unit;
}

function toKg(value: number, unit: string) {
  const u = unit.toLowerCase();
  if (u === "lb" || u === "lbs") return value * 0.45359237;
  return value;
}

function toCm(value: number, unit: string) {
  const u = unit.toLowerCase();
  if (u === "in" || u === "inch" || u === "inches") return value * 2.54;
  return value;
}

function ageFromDob(value: string | null | undefined): number | null {
  if (!value) return null;
  const dob = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function ClientEvolutionPanel({
  base,
  allowManage,
  clinicMethod,
  allowLog = false,
  enabledMeasurements,
  sex,
  dateOfBirth,
  onError,
  initialMetric,
  onMetricChange,
}: Props) {
  const canLog = allowManage || allowLog;
  const [data, setData] = useState<EvolutionResponse | null>(null);
  const [metric, setMetric] = useState<MeasurementMetricId>(() =>
    isMeasurementMetricId(initialMetric) ? initialMetric : "WEIGHT",
  );
  const [measureValue, setMeasureValue] = useState("");
  const [measureUnit, setMeasureUnit] = useState("kg");
  const [measureAt, setMeasureAt] = useState(() => localDateKey());
  const [saving, setSaving] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);
  const [multiAt, setMultiAt] = useState(() => localDateKey());
  const [multiValues, setMultiValues] = useState<Record<string, string>>({});
  const [nutritionMethod, setNutritionMethod] = useState<NutritionMethod>("iom");
  const [multiSaving, setMultiSaving] = useState(false);
  const [enabledMetricIds, setEnabledMetricIds] = useState<string[] | null>(null);

  const visibleGroups = useMemo(() => {
    if (!enabledMetricIds) return MEASUREMENT_GROUPS;
    const allowed = new Set(enabledMetricIds);
    return MEASUREMENT_GROUPS.map((group) => ({
      ...group,
      metrics: group.metrics.filter((metric) => !metric.stored || allowed.has(metric.id) || metric.id === "BMI"),
    })).filter((group) => group.metrics.length > 0);
  }, [enabledMetricIds]);

  const visibleStored = useMemo(
    () => STORED_MEASUREMENT_METRICS.filter((metric) => !enabledMetricIds || enabledMetricIds.includes(metric.id)),
    [enabledMetricIds],
  );

  const selected = findMeasurementMetric(metric) ?? ALL_MEASUREMENT_METRICS[0]!;

  const faculty = useMemo(() => {
    const latest = data?.latest;
    if (!latest) return null;
    const weight = latest.WEIGHT;
    const height = latest.HEIGHT;
    const waist = latest.WAIST;
    const hips = latest.HIPS;
    const wrist = latest.WRIST;
    const weightKg = weight ? toKg(weight.value, weight.unit) : null;
    const heightCm = height ? toCm(height.value, height.unit) : null;
    const waistCm = waist ? toCm(waist.value, waist.unit) : null;
    const hipCm = hips ? toCm(hips.value, hips.unit) : null;
    const wristCm = wrist ? toCm(wrist.value, wrist.unit) : null;
    const ibw = computeFacultyIbw(heightCm, sex ?? null, ageFromDob(dateOfBirth));
    const whr = computeWhr(waistCm, hipCm);
    const frameRatio = computeFrameRatio(heightCm, wristCm);
    const frame = facultyFrameSize(frameRatio, sex ?? null);
    if (!isFacultyMethod(clinicMethod ?? nutritionMethod)) return null;
    if (ibw == null && whr == null && frame == null) return null;
    return {
      ibw,
      percentIbw: percentOf(weightKg, ibw),
      whr,
      whrHigh: whrElevated(whr, sex ?? null),
      frame,
      frameRatio,
    };
  }, [data?.latest, sex, dateOfBirth, clinicMethod, nutritionMethod]);

  async function load() {
    const row = await api<EvolutionResponse>(`${base}/evolution`);
    setData(row);
  }

  useEffect(() => {
    void load().catch((err) => onError(errorMessage(err, "Unable to load measurements")));
  }, [base]);

  useEffect(() => {
    if (enabledMeasurements !== undefined) {
      setEnabledMetricIds(enabledMeasurements);
    }
    const dietitianId = /\/dietitian\/([^/]+)\//.exec(base)?.[1];
    if (!dietitianId) return;
    void api<{ enabledMeasurements?: string[] | null; defaultNutritionMethod?: string }>(
      `/api/v1/dietitian/${dietitianId}/settings`,
    )
      .then((settings) => {
        if (enabledMeasurements === undefined) {
          setEnabledMetricIds(settings.enabledMeasurements ?? null);
        }
        setNutritionMethod(sanitizeNutritionMethod(settings.defaultNutritionMethod));
      })
      .catch(() => undefined);
  }, [base, enabledMeasurements]);

  useEffect(() => {
    if (isMeasurementMetricId(initialMetric) && initialMetric !== metric) {
      setMetric(initialMetric);
      const next = findMeasurementMetric(initialMetric);
      if (next?.stored) setMeasureUnit(next.unit);
    }
  }, [initialMetric]);

  useEffect(() => {
    if (selected.stored) {
      setMeasureUnit(selected.unit);
    }
  }, [selected.id]);

  function selectMetric(next: MeasurementMetricId) {
    setMetric(next);
    onMetricChange?.(next);
  }

  const history: Point[] = useMemo(() => {
    if (!data) return [];
    if (metric === "BMI") {
      return [...data.bmiSeries].map((p, i) => ({ ...p, id: `bmi-${i}` })).reverse();
    }
    return [...(data.series[metric] ?? [])].reverse();
  }, [data, metric]);

  const chartPoints = useMemo(() => {
    if (!data) return [];
    if (metric === "BMI") {
      return data.bmiSeries.map((p) => ({ at: p.at, value: p.value }));
    }
    return (data.series[metric] ?? []).map((p) => ({ at: p.at, value: p.value }));
  }, [data, metric]);

  const unit =
    metric === "BMI" ? "kg/m²" : (data?.series[metric]?.[0]?.unit ?? selected.unit);

  function latestFor(id: MeasurementMetricId): { value: number; unit: string } | null {
    if (!data) return null;
    if (id === "BMI") {
      const last = data.bmiSeries.at(-1);
      return last ? { value: last.value, unit: last.unit } : null;
    }
    const row = data.latest[id];
    return row ? { value: row.value, unit: row.unit } : null;
  }

  async function saveOne(type: string, value: number, unitValue: string, at: string) {
    await api(`${base}/measurements`, {
      method: "POST",
      body: JSON.stringify({
        type,
        value,
        unit: unitValue,
        measuredAt: new Date(`${at}T12:00:00.000Z`).toISOString(),
      }),
    });
  }

  return (
    <div className="ui-evo">
      {allowManage ? (
        <div className="ui-evo__topbar">
          <Button
            type="button"
            size="sm"
            variant={multiOpen ? "primary" : "secondary"}
            onClick={() => setMultiOpen((open) => !open)}
          >
            Register multiple measurements at once
          </Button>
        </div>
      ) : null}

      {allowManage && multiOpen ? (
        <div className="ui-evo__multi">
          <div className="ui-evo__multi-head">
            <div>
              <h3>Register multiple measurements</h3>
              <p className="ui-muted">Leave blank any metrics you are not recording today.</p>
            </div>
            <Field label="Date">
              <Input type="date" value={multiAt} onChange={(e) => setMultiAt(e.target.value)} />
            </Field>
          </div>
          <div className="ui-evo__multi-groups">
            {visibleGroups.map((group) => {
              const metrics = group.metrics.filter((m) => m.stored);
              if (metrics.length === 0) return null;
              return (
                <section key={group.id} className="ui-evo__multi-group">
                  <h4>{group.label}</h4>
                  <div className="ui-evo__multi-grid">
                    {metrics.map((m) => (
                      <label key={m.id} className="ui-evo__multi-row">
                        <span className="ui-evo__multi-label">{m.label}</span>
                        <span className="ui-evo__multi-input">
                          <Input
                            type="number"
                            step="any"
                            placeholder="—"
                            value={multiValues[m.id] ?? ""}
                            onChange={(e) =>
                              setMultiValues((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                          />
                          <span className="ui-evo__multi-unit">{m.unit}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="ui-evo__multi-actions">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={multiSaving}
              onClick={() => {
                setMultiValues({});
                setMultiOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={multiSaving}
              onClick={() => {
                const entries = visibleStored.flatMap((m) => {
                  const raw = multiValues[m.id]?.trim();
                  if (!raw) return [];
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return [];
                  return [{ type: m.id, value, unit: m.unit }];
                });
                if (entries.length === 0) return;
                setMultiSaving(true);
                void (async () => {
                  for (const entry of entries) {
                    await saveOne(entry.type, entry.value, entry.unit, multiAt);
                  }
                  setMultiValues({});
                  setMultiOpen(false);
                  await load();
                })()
                  .catch((err) => onError(errorMessage(err, "Unable to save measurements")))
                  .finally(() => setMultiSaving(false));
              }}
            >
              {multiSaving ? "Saving…" : "Register selected"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="ui-evo__layout">
        <aside className="ui-evo__nav" aria-label="Measurement types">
          {visibleGroups.map((group) => (
            <section key={group.id} className="ui-evo__nav-group">
              <h3>{group.label}</h3>
              <ul>
                {group.metrics.map((m) => {
                  const latest = latestFor(m.id);
                  const active = metric === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={`ui-evo__nav-item${active ? " is-active" : ""}`}
                        aria-current={active ? "true" : undefined}
                        onClick={() => selectMetric(m.id)}
                      >
                        <span className="ui-evo__nav-label">{m.label}</span>
                        <span className="ui-evo__nav-value">
                          {latest ? formatMeasurementValue(latest.value, latest.unit) : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </aside>

        <div className="ui-evo__detail">
          {faculty ? (
            <section className="ui-evo__faculty">
              <div className="ui-evo__faculty-head">
                <h3>{FACULTY_METHOD_TITLE}</h3>
                <p className="ui-muted">{FACULTY_METHOD_HINT}</p>
              </div>
              <dl className="ui-faculty__stats">
                <div>
                  <dt>IBW</dt>
                  <dd>{faculty.ibw != null ? `${faculty.ibw} kg` : "—"}</dd>
                </div>
                <div>
                  <dt>% IBW</dt>
                  <dd>{faculty.percentIbw != null ? `${faculty.percentIbw}%` : "—"}</dd>
                </div>
                <div>
                  <dt>WHR</dt>
                  <dd>
                    {faculty.whr != null ? faculty.whr : "—"}
                    {faculty.whrHigh ? <Badge tone="warning">elevated</Badge> : null}
                  </dd>
                </div>
                <div>
                  <dt>Frame</dt>
                  <dd>
                    {faculty.frame ?? "—"}
                    {faculty.frameRatio != null ? <span className="ui-muted"> r {faculty.frameRatio}</span> : null}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
          <header className="ui-evo__detail-head">
            <h2>{selected.label}</h2>
            {!selected.stored ? (
              <p className="ui-muted">
                {selected.id === "LEAN_MASS"
                  ? "Calculated from weight and fat mass or body fat %."
                  : "Calculated from weight and height readings."}
              </p>
            ) : null}
          </header>

          {canLog && selected.stored ? (
            <form
              className="ui-evo__register"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(measureValue);
                if (!Number.isFinite(value)) return;
                setSaving(true);
                void saveOne(selected.id, value, measureUnit, measureAt)
                  .then(() => {
                    setMeasureValue("");
                    return load();
                  })
                  .catch((err) => onError(errorMessage(err, "Unable to save measurement")))
                  .finally(() => setSaving(false));
              }}
            >
              <h3>New measurement</h3>
              <div className="ui-evo__register-grid">
                <Field label="Date">
                  <Input
                    type="date"
                    value={measureAt}
                    onChange={(e) => setMeasureAt(e.target.value)}
                    required
                  />
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
                  {selected.units.length > 1 ? (
                    <Select value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)}>
                      {selected.units.map((u) => (
                        <option key={u} value={u}>
                          {unitLabel(u)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input value={measureUnit} readOnly />
                  )}
                </Field>
                <div className="ui-evo__register-action">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? "Saving…" : "Register"}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          <section className="ui-evo__progress">
            <div className="ui-evo__progress-head">
              <h3>Progress</h3>
              <p className="ui-muted">
                {chartPoints.length > 0
                  ? `${chartPoints.length} reading${chartPoints.length === 1 ? "" : "s"} · ${unit}`
                  : "Add measurements to see a trend."}
              </p>
            </div>
            <LineChart
              points={chartPoints}
              unit={unit}
              seriesLabel={`${selected.label} (${unit})`}
              height={220}
              emptyTitle="Add measurements to see a trend chart."
            />
          </section>

          <section className="ui-evo__history">
            <h3>History</h3>
            {history.length === 0 ? (
              <p className="ui-muted ui-evo__history-empty">
                No readings yet for {selected.label.toLowerCase()}.
              </p>
            ) : (
              <ul>
                {history.map((point, index) => {
                  const older = history[index + 1];
                  const delta = older ? roundDelta(point.value - older.value) : null;
                  const deltaTone =
                    delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
                  return (
                    <li key={point.id ?? `${point.at}-${point.value}`}>
                      <span className="ui-evo__history-avatar" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <circle cx="12" cy="8" r="3.5" />
                          <path d="M5 19c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      <div className="ui-evo__history-main">
                        <strong>{formatFullDate(point.at)}</strong>
                        <span className="ui-evo__history-value">
                          {formatMeasurementValue(point.value, point.unit || unit)}
                        </span>
                      </div>
                      <span className={`ui-evo__delta ui-evo__delta--${deltaTone}`}>
                        {delta == null
                          ? "—"
                          : delta === 0
                            ? "="
                            : `${delta > 0 ? "+" : ""}${delta} ${unit}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
