"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, Button, Dialog, DonutChart, Input, Select } from "@nutrition-saas/ui";
import { api } from "../lib/api";
import {
  emptyClinicalData,
  emptyPrescription,
  type ClinicalData,
  type PrescriptionActivity,
  type PrescriptionData,
} from "../lib/clinical-profile";
import { errorMessage } from "../lib/humanize-error";
import { ACTIVITY_COMPENDIUM, compendiumMet } from "../lib/activity-compendium";
import {
  AMDR,
  BMR_FORMULAS,
  BMR_FORMULA_GROUPS,
  BODY_FAT_FORMULAS,
  DEFAULT_BMR_FORMULA,
  DEFAULT_BODY_FAT_CONVERSION,
  DEFAULT_ENERGY_FORMULA,
  DEFAULT_FIBER_SOURCE,
  DEFAULT_MACRO_SPLIT,
  DEFAULT_PAL_KEY,
  ENERGY_FORMULAS,
  FIBER_SOURCES,
  MACRO_PRESETS,
  PAL_OPTIONS,
  bmiCategory,
  bodyFatReferenceRange,
  computeBmi,
  computeBmr,
  computeBodyFat,
  computeEer,
  computeTdee,
  fiberReferenceG,
  gramsPerKg,
  healthyWeightRange,
  macroGramsFromEnergy,
  palFromActivities,
  palValue,
  proteinPctFromPerKg,
  referenceWeightKg,
  totalActivityMinutes,
  type ActivityMet,
  type BmrFormulaId,
  type BodyFatFormulaId,
  type EnergyFormulaId,
  type PrescriptionInputs,
  type PrescriptionSex,
  type SkinfoldSite,
} from "../lib/prescription";

type Props = {
  base: string;
  allowManage: boolean;
  client: {
    sex: string | null;
    dateOfBirth: string | null;
  };
  latestMeasurements: Array<{ type: string; value: number; unit: string }>;
  onError: (message: string) => void;
};

const SKINFOLD_TYPES: Record<string, SkinfoldSite> = {
  SKINFOLD_TRICEPS: "triceps",
  SKINFOLD_SUBSCAPULAR: "subscapular",
  SKINFOLD_SUPRAILIAC: "suprailiac",
  SKINFOLD_CHEST: "chest",
  SKINFOLD_ABDOMINAL: "abdominal",
  SKINFOLD_FRONT_THIGH: "thigh",
  SKINFOLD_MIDAXILLARY: "midaxillary",
};

const MANUAL_BODY_FAT = "manual";

const MACRO_COLORS = {
  fat: "#e8a82e",
  carbohydrate: "#e89a6a",
  protein: "#4f8fe0",
} as const;

const FIBER_COLOR = "#1f9a82";

type MacroSplit = { fatPct: number; carbPct: number; proteinPct: number };
type MacroKey = keyof MacroSplit;

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function rebalanceMacros(current: MacroSplit, key: MacroKey, nextValue: number): MacroSplit {
  const clamped = roundTenth(Math.min(100, Math.max(0, nextValue)));
  const others = (["fatPct", "carbPct", "proteinPct"] as const).filter((item) => item !== key);
  const rest = roundTenth(100 - clamped);
  const first = current[others[0]!];
  const second = current[others[1]!];
  const sum = first + second;
  const nextFirst = sum <= 0 ? roundTenth(rest / 2) : roundTenth((first / sum) * rest);
  return {
    ...current,
    [key]: clamped,
    [others[0]!]: nextFirst,
    [others[1]!]: roundTenth(rest - nextFirst),
  };
}

function ageFromDob(value: string | null): number | null {
  if (!value) return null;
  const dob = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Human label for the months between two YYYY-MM values. */
function planLengthLabel(begin: string, finish: string): string {
  const parse = (value: string): number | null => {
    const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    return Number(match[1]) * 12 + Number(match[2]);
  };
  const a = parse(begin);
  const b = parse(finish);
  if (a == null || b == null) return "—";
  const months = b - a;
  if (months <= 0) return "—";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}

function fiberSourceNote(sourceId: string): string {
  return FIBER_SOURCES.find((source) => source.id === sourceId)?.note ?? "14 g / 1000 kcal";
}

function categoryTone(category: string | null): "success" | "warning" | "danger" | "neutral" {
  switch (category) {
    case "Normal":
      return "success";
    case "Overweight":
    case "Underweight":
      return "warning";
    case "Obese":
      return "danger";
    default:
      return "neutral";
  }
}

export function ClientPrescriptionPanel({ base, allowManage, client, latestMeasurements, onError }: Props) {
  const [clinical, setClinical] = useState<ClinicalData>(() => emptyClinicalData());
  const [loaded, setLoaded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [canUndoMacros, setCanUndoMacros] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const macroHistoryRef = useRef<Array<{ macro: MacroSplit; proteinPerKg: number | null }>>([]);
  const readOnly = !allowManage;
  const rx = clinical.prescription;

  const measurementValue = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of latestMeasurements) {
      if (!map.has(row.type)) map.set(row.type, row.value);
    }
    return (type: string): number | null => (map.has(type) ? (map.get(type) as number) : null);
  }, [latestMeasurements]);

  const inputs: PrescriptionInputs = useMemo(() => {
    const skinfolds: Partial<Record<SkinfoldSite, number | null>> = {};
    for (const [type, site] of Object.entries(SKINFOLD_TYPES)) {
      skinfolds[site] = measurementValue(type);
    }
    return {
      sex: (client.sex as PrescriptionSex | null) ?? "UNSPECIFIED",
      ageYears: ageFromDob(client.dateOfBirth),
      weightKg: measurementValue("WEIGHT"),
      heightCm: measurementValue("HEIGHT"),
      waistCm: measurementValue("WAIST"),
      hipsCm: measurementValue("HIPS"),
      skinfolds,
    };
  }, [client.sex, client.dateOfBirth, measurementValue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api<{ clinicalData?: ClinicalData }>(`${base}/profile`);
        if (cancelled) return;
        const base0 = emptyClinicalData();
        const merged: ClinicalData = {
          ...base0,
          ...(profile.clinicalData ?? {}),
          nutrition: {
            ...base0.nutrition,
            ...(profile.clinicalData?.nutrition ?? {}),
            targets: { ...base0.nutrition.targets, ...(profile.clinicalData?.nutrition?.targets ?? {}) },
          },
          prescription: {
            ...emptyPrescription(),
            ...(profile.clinicalData?.prescription ?? {}),
            macro: { ...emptyPrescription().macro, ...(profile.clinicalData?.prescription?.macro ?? {}) },
          },
        };
        setClinical(merged);
        setLoaded(true);
      } catch (err) {
        onError(errorMessage(err, "Unable to load prescription"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // ── availability ────────────────────────────────────────────────────────
  const hasBasics = inputs.weightKg != null && inputs.heightCm != null;

  const availableBodyFatFormulas = useMemo(
    () => BODY_FAT_FORMULAS.filter((f) => computeBodyFat(f.id, DEFAULT_BODY_FAT_CONVERSION, inputs) != null),
    [inputs],
  );

  // ── derived values ──────────────────────────────────────────────────────
  const weightKg = inputs.weightKg;
  const bmi = computeBmi(weightKg, inputs.heightCm);
  const goalBmi = computeBmi(rx.weightGoalKg, inputs.heightCm);
  const refWeight = referenceWeightKg(inputs.heightCm);
  const healthy = healthyWeightRange(inputs.heightCm);
  const bfRange = bodyFatReferenceRange(inputs.sex);

  const savedBodyFatFormula = rx.bodyFatFormula;
  const bodyFatFormula: BodyFatFormulaId | typeof MANUAL_BODY_FAT =
    savedBodyFatFormula === MANUAL_BODY_FAT
      ? MANUAL_BODY_FAT
      : availableBodyFatFormulas.some((f) => f.id === savedBodyFatFormula)
        ? (savedBodyFatFormula as BodyFatFormulaId)
        : availableBodyFatFormulas[0]?.id ?? MANUAL_BODY_FAT;
  const isManualBodyFat = bodyFatFormula === MANUAL_BODY_FAT;
  const computedBodyFat = isManualBodyFat
    ? null
    : computeBodyFat(bodyFatFormula, DEFAULT_BODY_FAT_CONVERSION, inputs);
  const measuredBodyFat = measurementValue("BODY_FAT");
  const currentBodyFat = computedBodyFat ?? rx.bodyFatCurrentPct ?? measuredBodyFat;

  const availableBmrFormulas = useMemo(
    () => BMR_FORMULAS.filter((f) => computeBmr(f.id, inputs, currentBodyFat) != null),
    [inputs, currentBodyFat],
  );
  const bmrFormula: BmrFormulaId = availableBmrFormulas.some((f) => f.id === rx.bmrFormula)
    ? (rx.bmrFormula as BmrFormulaId)
    : availableBmrFormulas.find((f) => f.id === DEFAULT_BMR_FORMULA)?.id ?? availableBmrFormulas[0]?.id ?? DEFAULT_BMR_FORMULA;

  const palCurrent = rx.palCurrentKey || DEFAULT_PAL_KEY;
  const palGoal = rx.palGoalKey || palCurrent;
  const palCurrentNumeric = rx.palCurrentValue ?? palValue(palCurrent);
  const palGoalNumeric = palValue(palGoal);
  const bmr = computeBmr(bmrFormula, inputs, currentBodyFat);
  const refBmr = computeBmr(bmrFormula, { ...inputs, weightKg: refWeight }, rx.bodyFatGoalPct ?? currentBodyFat);
  const energyFormula = (rx.energyFormula || DEFAULT_ENERGY_FORMULA) as EnergyFormulaId;
  const isEer = energyFormula === "eer_iom";
  const tdeeCurrent = isEer
    ? computeEer(inputs, palCurrentNumeric)
    : bmr != null && palCurrentNumeric != null
      ? Math.round(bmr * palCurrentNumeric)
      : null;
  const tdeeGoalComputed = isEer ? computeEer(inputs, palGoalNumeric) : computeTdee(bmr, palGoal);
  const energyGoal = rx.energyGoalKcal ?? tdeeGoalComputed;
  const refTdee = isEer
    ? computeEer({ ...inputs, weightKg: refWeight }, palGoalNumeric)
    : computeTdee(refBmr, palGoal);

  const macro = {
    fatPct: rx.macro.fatPct ?? DEFAULT_MACRO_SPLIT.fatPct,
    carbPct: rx.macro.carbPct ?? DEFAULT_MACRO_SPLIT.carbPct,
    proteinPct: rx.macro.proteinPct ?? DEFAULT_MACRO_SPLIT.proteinPct,
  };
  const macroGrams = macroGramsFromEnergy(energyGoal, macro);
  const macroSum = roundTenth(macro.fatPct + macro.carbPct + macro.proteinPct);
  const fiberSource = rx.fiberSource || DEFAULT_FIBER_SOURCE;
  const fiberRef = fiberReferenceG(fiberSource, energyGoal, inputs.sex);
  const fiberGoal = rx.fiberGoalG ?? fiberRef;

  const weightDelta =
    weightKg != null && rx.weightGoalKg != null ? Math.round((rx.weightGoalKg - weightKg) * 10) / 10 : null;

  // Macro donut. When an energy target exists we plot energy (kcal) so the hover
  // tip shows energy % + kcal; otherwise we fall back to the raw %-split so the
  // ring still renders. White gaps + hover tips come from the shared DonutChart.
  const hasMacroEnergy = macroGrams.fatG != null && macroGrams.carbohydrateG != null && macroGrams.proteinG != null;
  const macroDonutUnit = hasMacroEnergy ? "kcal" : "%";
  const macroSlices = [
    { label: "Fats", value: hasMacroEnergy ? macroGrams.fatG! * 9 : macro.fatPct, color: MACRO_COLORS.fat },
    {
      label: "Carbs",
      value: hasMacroEnergy ? macroGrams.carbohydrateG! * 4 : macro.carbPct,
      color: MACRO_COLORS.carbohydrate,
    },
    { label: "Protein", value: hasMacroEnergy ? macroGrams.proteinG! * 4 : macro.proteinPct, color: MACRO_COLORS.protein },
  ];

  // ── persistence ───────────────────────────────────────────────────────────
  function scheduleSave(next: ClinicalData) {
    if (!allowManage) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const nextEnergy = next.prescription.energyGoalKcal ?? energyGoal;
      const grams = macroGramsFromEnergy(nextEnergy, {
        fatPct: next.prescription.macro.fatPct ?? DEFAULT_MACRO_SPLIT.fatPct,
        carbPct: next.prescription.macro.carbPct ?? DEFAULT_MACRO_SPLIT.carbPct,
        proteinPct: next.prescription.macro.proteinPct ?? DEFAULT_MACRO_SPLIT.proteinPct,
      });
      const withTargets: ClinicalData = {
        ...next,
        nutrition: {
          ...next.nutrition,
          targets: {
            energyKcal: nextEnergy ?? null,
            fatG: grams.fatG,
            carbohydrateG: grams.carbohydrateG,
            proteinG: grams.proteinG,
            fiberG: next.prescription.fiberGoalG ?? fiberRef ?? null,
          },
        },
      };
      void api(`${base}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ clinicalData: withTargets }),
      }).catch((err) => onError(errorMessage(err, "Unable to save prescription")));
    }, 700);
  }

  function patchRx(patch: Partial<PrescriptionData>) {
    setClinical((prev) => {
      const next: ClinicalData = { ...prev, prescription: { ...prev.prescription, ...patch } };
      scheduleSave(next);
      return next;
    });
  }

  function pushMacroHistory() {
    if (readOnly) return;
    macroHistoryRef.current = [
      ...macroHistoryRef.current,
      { macro: { ...macro }, proteinPerKg: rx.proteinPerKg },
    ].slice(-25);
    setCanUndoMacros(true);
  }

  function undoMacros() {
    const last = macroHistoryRef.current[macroHistoryRef.current.length - 1];
    if (!last) return;
    macroHistoryRef.current = macroHistoryRef.current.slice(0, -1);
    setCanUndoMacros(macroHistoryRef.current.length > 0);
    patchRx({ macro: last.macro, proteinPerKg: last.proteinPerKg });
  }

  function setMacroPct(key: MacroKey, value: number) {
    patchRx({ macro: rebalanceMacros(macro, key, value), proteinPerKg: null });
  }

  function applyMacroPreset(split: { fatPct: number; carbPct: number; proteinPct: number }) {
    pushMacroHistory();
    patchRx({ macro: { ...split }, proteinPerKg: null });
  }

  function applyProteinPerKg(perKg: number | null) {
    if (perKg == null) {
      patchRx({ proteinPerKg: null });
      return;
    }
    const proteinPct = proteinPctFromPerKg(perKg, weightKg, energyGoal);
    if (proteinPct == null) {
      patchRx({ proteinPerKg: perKg });
      return;
    }
    const fat = macro.fatPct;
    const carb = Math.max(0, 100 - fat - proteinPct);
    patchRx({ macro: { fatPct: fat, carbPct: carb, proteinPct }, proteinPerKg: perKg });
  }

  function applyActivities(activities: PrescriptionActivity[], pal: number | null) {
    patchRx({ activities, palCurrentValue: pal });
    setActivityOpen(false);
  }

  return (
    <div className="ui-prescription">
      {!loaded ? (
        <header className="ui-prescription__head">
          <span className="ui-prescription__status">Loading…</span>
        </header>
      ) : null}

      {loaded && !hasBasics ? (
        <div className="ui-prescription__notice">
          <IconAlert />
          <span>
            Add a <strong>weight</strong> and <strong>height</strong> in Progress &amp; tracking → Measurement to
            calculate this prescription.
          </span>
        </div>
      ) : null}

      {/* ── BODY COMPOSITION ── */}
      <Section
        title="Body composition"
        subtitle="Measured now vs. your goal, with a healthy reference."
        icon={<IconBody />}
      >
        <MetricTable>
          {/* Weight */}
          <Row
            name="Weight"
            current={<Value>{weightKg != null ? `${fmt(weightKg)} kg` : "—"}</Value>}
            goal={
              <NumberField
                readOnly={readOnly}
                value={rx.weightGoalKg}
                unit="kg"
                onChange={(v) => patchRx({ weightGoalKg: v })}
              />
            }
            reference={
              <Value muted>
                {refWeight != null ? `${fmt(refWeight)} kg` : "—"}
                {weightDelta != null && weightDelta !== 0 ? (
                  <Badge tone={weightDelta < 0 ? "success" : "warning"}>
                    {Math.abs(weightDelta)} kg {weightDelta < 0 ? "to lose" : "to gain"}
                  </Badge>
                ) : null}
              </Value>
            }
          />

          {/* Body fat */}
          <Row
            name="Body fat"
            method={
              <MethodSelect
                readOnly={readOnly}
                ariaLabel="Body fat method"
                value={bodyFatFormula}
                onChange={(value) => patchRx({ bodyFatFormula: value })}
              >
                {availableBodyFatFormulas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
                <option value={MANUAL_BODY_FAT}>Manual entry</option>
              </MethodSelect>
            }
            current={
              isManualBodyFat ? (
                <NumberField
                  readOnly={readOnly}
                  value={rx.bodyFatCurrentPct}
                  unit="%"
                  placeholder={measuredBodyFat != null ? `${fmt(measuredBodyFat)}` : "%"}
                  onChange={(v) => patchRx({ bodyFatCurrentPct: v })}
                />
              ) : (
                <Value>{computedBodyFat != null ? `${fmt(computedBodyFat)} %` : "—"}</Value>
              )
            }
            goal={
              <NumberField
                readOnly={readOnly}
                value={rx.bodyFatGoalPct}
                unit="%"
                onChange={(v) => patchRx({ bodyFatGoalPct: v })}
              />
            }
            reference={
              <Value muted>
                {fmt(bfRange.min)} – {fmt(bfRange.max)} %
              </Value>
            }
          />

          {/* BMI */}
          <Row
            name="Body mass index"
            current={
              <Value>
                {bmi != null ? `${fmt(bmi)}` : "—"}
                {bmi != null ? <Badge tone={categoryTone(bmiCategory(bmi))}>{bmiCategory(bmi)}</Badge> : null}
              </Value>
            }
            goal={
              <Value>
                {goalBmi != null ? `${fmt(goalBmi)}` : "—"}
                {goalBmi != null ? (
                  <Badge tone={categoryTone(bmiCategory(goalBmi))}>{bmiCategory(goalBmi)}</Badge>
                ) : null}
              </Value>
            }
            reference={<Value muted>{healthy != null ? `${fmt(healthy.min)} – ${fmt(healthy.max)} kg` : "18.5 – 24.9"}</Value>}
          />
        </MetricTable>
      </Section>

      {/* ── ENERGY NEEDS ── */}
      <Section
        title="Energy needs"
        subtitle="Reference is calculated at a healthy body weight."
        icon={<IconEnergy />}
      >
        <MetricTable>
          {/* Activity level */}
          <Row
            name="Activity level"
            current={
              <span className="ui-prescription__activity">
                {rx.palCurrentValue != null ? (
                  <Value>
                    PAL {fmt(rx.palCurrentValue, 2)}
                    <Badge tone="neutral">from activities</Badge>
                  </Value>
                ) : (
                  <SelectField
                    readOnly={readOnly}
                    value={palCurrent}
                    onChange={(value) => patchRx({ palCurrentKey: value })}
                    options={PAL_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
                    badge={`PAL ${palValue(palCurrent)}`}
                  />
                )}
                {!readOnly ? (
                  <span className="ui-prescription__activity-actions">
                    <button
                      type="button"
                      className="ui-prescription__link"
                      onClick={() => setActivityOpen(true)}
                    >
                      {rx.palCurrentValue != null ? "Recalculate" : "Calculate from activities"}
                    </button>
                    {rx.palCurrentValue != null ? (
                      <button
                        type="button"
                        className="ui-prescription__link ui-prescription__link--muted"
                        onClick={() => patchRx({ palCurrentValue: null })}
                      >
                        Use band
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </span>
            }
            goal={
              <SelectField
                readOnly={readOnly}
                value={palGoal}
                onChange={(value) => patchRx({ palGoalKey: value })}
                options={PAL_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
                badge={`PAL ${palValue(palGoal)}`}
              />
            }
            reference={<Value muted>—</Value>}
          />

          {/* BMR */}
          <Row
            name="Basal metabolic rate"
            method={
              availableBmrFormulas.length ? (
                <MethodSelect
                  readOnly={readOnly}
                  ariaLabel="BMR formula"
                  value={bmrFormula}
                  onChange={(value) => patchRx({ bmrFormula: value })}
                >
                  {BMR_FORMULA_GROUPS.map((group) => {
                    const formulas = availableBmrFormulas.filter((f) => f.group === group);
                    if (formulas.length === 0) return null;
                    return (
                      <optgroup key={group} label={group}>
                        {formulas.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </MethodSelect>
              ) : null
            }
            current={<Value>{bmr != null ? `${fmt(bmr, 0)} kcal` : "—"}</Value>}
            goal={<Value muted>—</Value>}
            reference={<Value muted>{refBmr != null ? `${fmt(refBmr, 0)} kcal` : "—"}</Value>}
          />

          {/* TDEE / energy target */}
          <Row
            name="Daily energy target"
            method={
              <MethodSelect
                readOnly={readOnly}
                ariaLabel="Energy formula"
                value={energyFormula}
                onChange={(value) => patchRx({ energyFormula: value })}
              >
                {ENERGY_FORMULAS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </MethodSelect>
            }
            current={<Value>{tdeeCurrent != null ? `${fmt(tdeeCurrent, 0)} kcal` : "—"}</Value>}
            goal={
              <NumberField
                readOnly={readOnly}
                value={rx.energyGoalKcal}
                unit="kcal"
                placeholder={tdeeGoalComputed != null ? `${fmt(tdeeGoalComputed, 0)}` : "kcal"}
                onChange={(v) => patchRx({ energyGoalKcal: v })}
              />
            }
            reference={<Value muted>{refTdee != null ? `${fmt(refTdee, 0)} kcal` : "—"}</Value>}
          />
        </MetricTable>
      </Section>

      {/* ── MACRO TARGETS ── */}
      <Section
        title="Macro targets"
        subtitle={`Based on a ${energyGoal != null ? `${fmt(energyGoal, 0)} kcal` : "—"} daily target. These are sent to Nutrition → Analysis.`}
        icon={<IconMacros />}
      >
        {!readOnly ? (
          <div className="ui-prescription__presets">
            <span className="ui-prescription__presets-label">Strategy</span>
            <div className="ui-prescription__preset-chips">
              {MACRO_PRESETS.map((preset) => {
                const active =
                  macro.fatPct === preset.fatPct &&
                  macro.carbPct === preset.carbPct &&
                  macro.proteinPct === preset.proteinPct;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={`ui-prescription__chip${active ? " ui-prescription__chip--active" : ""}`}
                    title={preset.hint}
                    aria-pressed={active}
                    onClick={() =>
                      applyMacroPreset({
                        fatPct: preset.fatPct,
                        carbPct: preset.carbPct,
                        proteinPct: preset.proteinPct,
                      })
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ui-prescription__undo"
              disabled={!canUndoMacros}
              onClick={() => undoMacros()}
            >
              Undo
            </Button>
          </div>
        ) : null}
        <div className="ui-prescription__macro-layout">
          <div className="ui-prescription__macro-main">
            <div className="ui-prescription__grid ui-prescription__grid--macro">
              <div className="ui-prescription__hrow" role="row">
                <span>Nutrient</span>
                <span>% of energy</span>
                <span>Amount</span>
                <span>Reference</span>
              </div>
              <MacroRow
                label="Fats"
                color={MACRO_COLORS.fat}
                pct={macro.fatPct}
                grams={macroGrams.fatG}
                perKg={gramsPerKg(macroGrams.fatG, weightKg)}
                reference={`${AMDR.fat.min}–${AMDR.fat.max}%`}
                readOnly={readOnly}
                onBeginEdit={pushMacroHistory}
                onPct={(v) => setMacroPct("fatPct", v)}
              />
              <MacroRow
                label="Carbohydrates"
                color={MACRO_COLORS.carbohydrate}
                pct={macro.carbPct}
                grams={macroGrams.carbohydrateG}
                perKg={gramsPerKg(macroGrams.carbohydrateG, weightKg)}
                reference={`${AMDR.carbohydrate.min}–${AMDR.carbohydrate.max}%`}
                readOnly={readOnly}
                onBeginEdit={pushMacroHistory}
                onPct={(v) => setMacroPct("carbPct", v)}
              />
              <MacroRow
                label="Proteins"
                color={MACRO_COLORS.protein}
                pct={macro.proteinPct}
                grams={macroGrams.proteinG}
                perKg={gramsPerKg(macroGrams.proteinG, weightKg)}
                reference={`${AMDR.protein.min}–${AMDR.protein.max}%`}
                readOnly={readOnly}
                onBeginEdit={pushMacroHistory}
                onPct={(v) => setMacroPct("proteinPct", v)}
              />
              {/* Fiber */}
              <div className="ui-prescription__row ui-prescription__row--macro" role="row">
                <span className="ui-prescription__cell ui-prescription__cell--metric ui-prescription__cell--fiber">
                  <span className="ui-prescription__metric-head">
                    <span className="ui-prescription__dot" style={{ backgroundColor: FIBER_COLOR }} aria-hidden="true" />
                    <span className="ui-prescription__name">Dietary fiber</span>
                  </span>
                  <MethodSelect
                    readOnly={readOnly}
                    ariaLabel="Fiber reference source"
                    value={fiberSource}
                    onChange={(value) => patchRx({ fiberSource: value })}
                  >
                    {FIBER_SOURCES.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.label} · {source.note}
                      </option>
                    ))}
                  </MethodSelect>
                </span>
                <span className="ui-prescription__cell" data-label="% of energy">
                  <Value muted>—</Value>
                </span>
                <span className="ui-prescription__cell" data-label="Amount">
                  <NumberField
                    readOnly={readOnly}
                    value={rx.fiberGoalG}
                    unit="g"
                    placeholder={fiberRef != null ? `${fmt(fiberRef)}` : "g"}
                    onChange={(v) => patchRx({ fiberGoalG: v })}
                  />
                </span>
                <span className="ui-prescription__cell" data-label="Reference">
                  <Value muted>{fiberRef != null ? `${fmt(fiberRef)} g` : fiberSourceNote(fiberSource)}</Value>
                </span>
              </div>
            </div>
            <div className="ui-prescription__macro-foot">
              <label className="ui-prescription__perkg">
                <span className="ui-prescription__perkg-copy">
                  <span className="ui-prescription__perkg-label">Prescribe protein by body weight</span>
                  <span className="ui-prescription__perkg-hint">
                    {rx.proteinPerKg != null && macroGrams.proteinG != null
                      ? `= ${fmt(macroGrams.proteinG, 0)} g protein/day · sets carbs to balance`
                      : "Typical: 0.8 sedentary · 1.2–1.6 active · 1.6–2.2 muscle gain"}
                  </span>
                </span>
                <span className="ui-prescription__field ui-prescription__perkg-input">
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    inputMode="decimal"
                    disabled={readOnly || weightKg == null || energyGoal == null}
                    value={rx.proteinPerKg ?? ""}
                    placeholder="1.6"
                    onFocus={() => pushMacroHistory()}
                    onChange={(event) => applyProteinPerKg(numberOrNull(event.target.value))}
                  />
                  <span className="ui-prescription__unit">g/kg</span>
                </span>
              </label>
              <p className={`ui-prescription__macro-sum${macroSum === 100 ? "" : " ui-prescription__macro-sum--warn"}`}>
                Macros total {fmt(macroSum, 1)}%{macroSum === 100 ? "" : " — should add up to 100%"}
              </p>
            </div>
          </div>
          <aside className="ui-prescription__macro-aside">
            <DonutChart
              size={168}
              thickness={22}
              legend={false}
              showPct={false}
              valueUnit={macroDonutUnit}
              slices={macroSlices}
              center={
                <span className="ui-prescription__donut-center">
                  <span className="ui-prescription__donut-kcal">{energyGoal != null ? fmt(energyGoal, 0) : "—"}</span>
                  <span className="ui-prescription__donut-unit">kcal / day</span>
                </span>
              }
            />
          </aside>
        </div>
      </Section>

      <ActivityDialog
        open={activityOpen}
        initial={rx.activities}
        onClose={() => setActivityOpen(false)}
        onApply={applyActivities}
      />

      {/* ── DURATION ── */}
      <Section title="Duration" subtitle="Track the plan window and how long it runs." icon={<IconDuration />}>
        <div className="ui-prescription__duration">
          <label className="ui-prescription__duration-card">
            <span className="ui-prescription__duration-label">Begin</span>
            <Input
              type="month"
              disabled={readOnly}
              value={rx.beginDate}
              onChange={(event) => patchRx({ beginDate: event.target.value })}
            />
          </label>
          <div className="ui-prescription__duration-arrow" aria-hidden="true">
            <span className="ui-prescription__duration-caret">→</span>
            {planLengthLabel(rx.beginDate, rx.forecastFinishDate) !== "—" ? (
              <span className="ui-prescription__duration-length">
                {planLengthLabel(rx.beginDate, rx.forecastFinishDate)}
              </span>
            ) : null}
          </div>
          <label className="ui-prescription__duration-card">
            <span className="ui-prescription__duration-label">Forecast finish</span>
            <Input
              type="month"
              disabled={readOnly}
              value={rx.forecastFinishDate}
              onChange={(event) => patchRx({ forecastFinishDate: event.target.value })}
            />
          </label>
          <div className="ui-prescription__duration-card ui-prescription__duration-card--static">
            <span className="ui-prescription__duration-label">Last updated</span>
            <span className="ui-prescription__duration-static">
              {new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── Layout primitives (consistent across every section) ────────────────────

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ui-prescription__section">
      <div className="ui-prescription__section-head">
        {icon ? <span className="ui-prescription__section-icon">{icon}</span> : null}
        <div className="ui-prescription__section-heading">
          <h3 className="ui-prescription__section-title">{title}</h3>
          {subtitle ? <p className="ui-prescription__section-sub">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

// ── Icons (18px, inherit currentColor) ──────────────────────────────────────

function IconBody() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.4" />
      <path d="M5 9h14M12 9v5m0 0l-3 6m3-6l3 6" />
    </svg>
  );
}

function IconEnergy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
  );
}

function IconMacros() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 9 9h-9V3z" />
      <path d="M12 3v9h9" opacity="0.55" />
    </svg>
  );
}

function IconDuration() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

function MetricTable({ children }: { children: ReactNode }) {
  return (
    <div className="ui-prescription__grid ui-prescription__grid--metric">
      <div className="ui-prescription__hrow" role="row">
        <span>Metric</span>
        <span>Current</span>
        <span>Goal</span>
        <span>Reference</span>
      </div>
      {children}
    </div>
  );
}

function Row({
  name,
  method,
  current,
  goal,
  reference,
}: {
  name: string;
  method?: ReactNode;
  current: ReactNode;
  goal: ReactNode;
  reference: ReactNode;
}) {
  return (
    <div className="ui-prescription__row" role="row">
      <span className="ui-prescription__cell ui-prescription__cell--metric">
        <span className="ui-prescription__name">{name}</span>
        {method}
      </span>
      <span className="ui-prescription__cell" data-label="Current">
        {current}
      </span>
      <span className="ui-prescription__cell" data-label="Goal">
        {goal}
      </span>
      <span className="ui-prescription__cell" data-label="Reference">
        {reference}
      </span>
    </div>
  );
}

function MethodSelect({
  value,
  onChange,
  ariaLabel,
  readOnly,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  readOnly: boolean;
  children: ReactNode;
}) {
  return (
    <span className="ui-prescription__method">
      <span className="ui-prescription__method-label">Method</span>
      <Select
        className="ui-prescription__method-select"
        disabled={readOnly}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </Select>
    </span>
  );
}

function Value({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={muted ? "ui-prescription__value ui-prescription__value--muted" : "ui-prescription__value"}>{children}</span>;
}

function NumberField({
  value,
  unit,
  placeholder,
  readOnly,
  onChange,
}: {
  value: number | null;
  unit?: string;
  placeholder?: string;
  readOnly: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <span className="ui-prescription__field">
      <Input
        type="number"
        min={0}
        step="0.1"
        inputMode="decimal"
        disabled={readOnly}
        value={value ?? ""}
        placeholder={placeholder ?? unit ?? ""}
        onChange={(event) => onChange(numberOrNull(event.target.value))}
      />
      {unit ? <span className="ui-prescription__unit">{unit}</span> : null}
    </span>
  );
}

function SelectField({
  value,
  options,
  badge,
  readOnly,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  badge?: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className="ui-prescription__field">
      <Select disabled={readOnly} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {badge ? <span className="ui-prescription__unit">{badge}</span> : null}
    </span>
  );
}

// ── Activity / MET builder ─────────────────────────────────────────────────

type ActivityRow = { id: string; key: string; met: number | null; minutes: number | null };

let activityRowSeq = 0;
function nextRowId(): string {
  activityRowSeq += 1;
  return `act-${activityRowSeq}`;
}

const COMPENDIUM_LABEL = new Map(ACTIVITY_COMPENDIUM.map((a) => [a.key, a.label]));

function activityLabel(key: string): string {
  return COMPENDIUM_LABEL.get(key) ?? "Custom activity";
}

const DEFAULT_DAY: Array<{ key: string; minutes: number }> = [
  { key: "sleep", minutes: 480 },
  { key: "showering", minutes: 30 },
  { key: "office", minutes: 480 },
  { key: "commute_walk", minutes: 30 },
  { key: "driving_car", minutes: 30 },
  { key: "cooking", minutes: 60 },
  { key: "dusting", minutes: 60 },
  { key: "walk_moderate", minutes: 30 },
  { key: "tv", minutes: 240 },
];

function seedRows(initial: PrescriptionActivity[]): ActivityRow[] {
  const source =
    initial.length > 0
      ? initial.map((entry) => ({ key: entry.key, met: entry.met, minutes: entry.minutes }))
      : DEFAULT_DAY.map((entry) => ({ key: entry.key, met: compendiumMet(entry.key), minutes: entry.minutes }));
  return source.map((entry) => ({ id: nextRowId(), ...entry }));
}

const PICKER_PAGE_SIZE = 7;

function ActivityDialog({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: PrescriptionActivity[];
  onClose: () => void;
  onApply: (activities: PrescriptionActivity[], pal: number | null) => void;
}) {
  const [rows, setRows] = useState<ActivityRow[]>(() => seedRows(initial));
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // Reseed whenever the dialog is (re)opened so it reflects saved data.
  useEffect(() => {
    if (open) {
      setRows(seedRows(initial));
      setAdding(false);
      setQuery("");
      setPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entries: PrescriptionActivity[] = rows.map((r) => ({ key: r.key, met: r.met, minutes: r.minutes }));
  const pal = palFromActivities(entries);
  const totalMin = totalActivityMinutes(entries);
  const totalLabel = `${Math.floor(totalMin / 60)}h ${String(Math.round(totalMin % 60)).padStart(2, "0")}m`;
  const dayComplete = Math.abs(totalMin - 1440) <= 15;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? ACTIVITY_COMPENDIUM.filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q))
      : ACTIVITY_COMPENDIUM;
    return list;
  }, [query]);

  const pageCount = Math.max(1, Math.ceil(matches.length / PICKER_PAGE_SIZE));
  const pageItems = matches.slice(page * PICKER_PAGE_SIZE, page * PICKER_PAGE_SIZE + PICKER_PAGE_SIZE);

  function setRow(id: string, patch: Partial<ActivityRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function setMinutes(id: string, hours: number, minutes: number) {
    setRow(id, { minutes: Math.max(0, Math.round(hours * 60 + minutes)) });
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addActivity(activity: ActivityMet, minutes: number) {
    setRows((prev) => [...prev, { id: nextRowId(), key: activity.key, met: activity.met, minutes }]);
  }

  function openPicker() {
    setQuery("");
    setPage(0);
    setAdding(true);
  }

  const title = adding ? "Add physical activity" : "Build activity level (PAL)";

  return (
    <Dialog open={open} title={title} onClose={onClose} className="ui-activity-dialog">
      {adding ? (
        <ActivityPicker
          items={pageItems}
          query={query}
          page={page}
          pageCount={pageCount}
          onQuery={(value) => {
            setQuery(value);
            setPage(0);
          }}
          onPage={setPage}
          onAdd={addActivity}
          onBack={() => setAdding(false)}
        />
      ) : (
        <>
          <p className="ui-activity__intro">
            Log a typical 24-hour day. PAL is the time-weighted average of each activity&apos;s MET value — a more
            precise alternative to the activity band. MET values follow the Compendium of Physical Activities.
          </p>
          <div className="ui-activity__table" role="table">
            <div className="ui-activity__hrow" role="row">
              <span>Activity</span>
              <span>Time (h : m)</span>
              <span>MET</span>
              <span aria-hidden="true" />
            </div>
            {rows.length === 0 ? (
              <p className="ui-activity__empty">No activities yet — add one below.</p>
            ) : (
              rows.map((row) => {
                const hours = Math.floor((row.minutes ?? 0) / 60);
                const mins = (row.minutes ?? 0) % 60;
                const isCustom = !COMPENDIUM_LABEL.has(row.key) || row.key === "other";
                return (
                  <div className="ui-activity__row" role="row" key={row.id}>
                    <span className="ui-activity__name" title={activityLabel(row.key)}>
                      {activityLabel(row.key)}
                    </span>
                    <span className="ui-activity__time">
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        step={1}
                        aria-label="Hours"
                        value={hours}
                        onChange={(event) => setMinutes(row.id, numberOrNull(event.target.value) ?? 0, mins)}
                      />
                      <span className="ui-activity__colon">:</span>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        step={5}
                        aria-label="Minutes"
                        value={mins}
                        onChange={(event) => setMinutes(row.id, hours, numberOrNull(event.target.value) ?? 0)}
                      />
                    </span>
                    <span className="ui-activity__met">
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        aria-label="MET"
                        disabled={!isCustom}
                        value={row.met ?? ""}
                        onChange={(event) => setRow(row.id, { met: numberOrNull(event.target.value) })}
                      />
                    </span>
                    <button
                      type="button"
                      className="ui-activity__remove"
                      aria-label="Remove activity"
                      onClick={() => removeRow(row.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <button type="button" className="ui-activity__add" onClick={openPicker}>
            + Add new physical activity component
          </button>
          <div className="ui-activity__foot">
            <div className="ui-activity__summary">
              <span className={`ui-activity__total${dayComplete ? "" : " ui-activity__total--warn"}`}>
                {totalLabel} logged
              </span>
              <span className="ui-activity__pal">
                PAL <strong>{pal != null ? pal.toFixed(3) : "—"}</strong>
              </span>
            </div>
            <div className="ui-activity__buttons">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" disabled={pal == null} onClick={() => onApply(entries, pal)}>
                Set PAL
              </Button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}

function ActivityPicker({
  items,
  query,
  page,
  pageCount,
  onQuery,
  onPage,
  onAdd,
  onBack,
}: {
  items: ActivityMet[];
  query: string;
  page: number;
  pageCount: number;
  onQuery: (value: string) => void;
  onPage: (page: number) => void;
  onAdd: (activity: ActivityMet, minutes: number) => void;
  onBack: () => void;
}) {
  // Per-visible-row draft duration + unit, keyed by activity key.
  const [drafts, setDrafts] = useState<Record<string, { amount: number; unit: "minutes" | "hours" }>>({});

  function draftFor(key: string) {
    return drafts[key] ?? { amount: 20, unit: "minutes" as const };
  }

  function setDraft(key: string, patch: Partial<{ amount: number; unit: "minutes" | "hours" }>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...draftFor(key), ...patch } }));
  }

  function add(activity: ActivityMet) {
    const d = draftFor(activity.key);
    const minutes = d.unit === "hours" ? Math.round(d.amount * 60) : Math.round(d.amount);
    if (minutes > 0) onAdd(activity, minutes);
  }

  return (
    <div className="ui-activity-picker">
      <div className="ui-activity-picker__search">
        <Input
          type="search"
          placeholder="Search physical activity"
          value={query}
          autoFocus
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <div className="ui-activity-picker__list">
        {items.length === 0 ? (
          <p className="ui-activity__empty">No activities match “{query}”.</p>
        ) : (
          items.map((activity) => {
            const d = draftFor(activity.key);
            return (
              <div className="ui-activity-picker__row" key={activity.key}>
                <div className="ui-activity-picker__qty">
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    aria-label="Duration"
                    value={d.amount}
                    onChange={(event) => setDraft(activity.key, { amount: numberOrNull(event.target.value) ?? 0 })}
                  />
                  <Select
                    aria-label="Unit"
                    value={d.unit}
                    onChange={(event) => setDraft(activity.key, { unit: event.target.value as "minutes" | "hours" })}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                  </Select>
                </div>
                <div className="ui-activity-picker__info">
                  <span className="ui-activity-picker__name">{activity.label}</span>
                  <span className="ui-activity-picker__source">Compendium of physical activities</span>
                </div>
                <span className="ui-activity-picker__met">
                  <strong>{activity.met.toFixed(1)}</strong>
                  <span>MET</span>
                </span>
                <button
                  type="button"
                  className="ui-activity-picker__add"
                  aria-label={`Add ${activity.label}`}
                  onClick={() => add(activity)}
                >
                  +
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="ui-activity-picker__foot">
        <Button variant="secondary" onClick={onBack}>
          ← Back to day
        </Button>
        <div className="ui-activity-picker__pager">
          <button
            type="button"
            className="ui-activity-picker__page"
            disabled={page <= 0}
            aria-label="Previous page"
            onClick={() => onPage(Math.max(0, page - 1))}
          >
            ‹
          </button>
          <span className="ui-activity-picker__page-info">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="ui-activity-picker__page"
            disabled={page >= pageCount - 1}
            aria-label="Next page"
            onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

function MacroRow({
  label,
  color,
  pct,
  grams,
  perKg,
  reference,
  readOnly,
  onBeginEdit,
  onPct,
}: {
  label: string;
  color: string;
  pct: number;
  grams: number | null;
  perKg: number | null;
  reference: string;
  readOnly: boolean;
  onBeginEdit: () => void;
  onPct: (value: number) => void;
}) {
  const value = roundTenth(Math.min(100, Math.max(0, pct)));
  return (
    <div className="ui-prescription__row ui-prescription__row--macro" role="row">
      <span className="ui-prescription__cell ui-prescription__cell--metric">
        <span className="ui-prescription__dot" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="ui-prescription__name">{label}</span>
      </span>
      <span
        className="ui-prescription__cell ui-prescription__pct"
        data-label="% of energy"
        style={{ "--range-color": color, "--range-pct": `${value}%` } as CSSProperties}
      >
        <input
          type="range"
          className="ui-prescription__range"
          min={0}
          max={100}
          step={0.1}
          disabled={readOnly}
          value={value}
          aria-label={`${label} percent of energy`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={`${fmt(value, 1)} percent of energy`}
          onPointerDown={() => onBeginEdit()}
          onChange={(event) => onPct(Number(event.target.value))}
        />
        <Input
          type="number"
          className="ui-prescription__pct-input"
          min={0}
          max={100}
          step={0.1}
          inputMode="decimal"
          disabled={readOnly}
          value={Number.isFinite(value) ? value : ""}
          aria-label={`${label} percent of energy value`}
          onFocus={() => onBeginEdit()}
          onChange={(event) => {
            const next = numberOrNull(event.target.value);
            if (next != null) onPct(next);
          }}
        />
        <span className="ui-prescription__pct-value">%</span>
      </span>
      <span className="ui-prescription__cell" data-label="Amount">
        <span className="ui-prescription__value">{grams != null ? `${fmt(grams, 0)} g` : "—"}</span>
        {perKg != null ? <span className="ui-prescription__subvalue">{fmt(perKg, 2)} g/kg</span> : null}
      </span>
      <span className="ui-prescription__cell" data-label="Reference">
        <Value muted>{reference}</Value>
      </span>
    </div>
  );
}
