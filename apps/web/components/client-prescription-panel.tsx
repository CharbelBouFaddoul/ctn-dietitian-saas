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
import { FacultyExchangeEditor } from "./faculty-exchange-editor";
import {
  FACULTY_PAL_OPTIONS,
  computeFacultyAbw,
  computeFacultyIbw,
  computeFrameRatio,
  computeWhr,
  emptyFacultyExchanges,
  facultyFrameSize,
  facultyMacroPercents,
  facultyObeseForAbw,
  facultyTargetsFromExchanges,
  isFacultyMethod,
  isFacultyPalKey,
  percentOf,
  percentWeightChange,
  sanitizeNutritionMethod,
  tallyExchanges,
  whrElevated,
  type FacultyExchangeId,
  type NutritionMethod,
} from "../lib/faculty-nutrition";
import {
  AMDR,
  BMR_FORMULAS,
  BMR_FORMULA_GROUPS,
  BODY_FAT_FORMULAS,
  DEFAULT_BMR_FORMULA,
  DEFAULT_BODY_FAT_CONVERSION,
  DEFAULT_ENERGY_FORMULA,
  DEFAULT_MACRO_SPLIT,
  DEFAULT_PAL_KEY,
  ENERGY_FORMULAS,
  FIBER_AI,
  MACRO_PRESETS,
  PAL_OPTIONS,
  bmiCategory,
  bodyFatReferenceRange,
  computeBmi,
  computeBmr,
  computeBodyFat,
  computeEer,
  computeTdee,
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
  clinicMethod?: NutritionMethod;
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

function facultyPlanVsNeed(planKcal: number, needKcal: number): string {
  const diff = Math.round(planKcal - needKcal);
  if (diff === 0) return "Plan matches estimated need";
  const amount = fmt(Math.abs(diff), 0);
  return diff > 0 ? `${amount} kcal above estimated need` : `${amount} kcal below estimated need`;
}

function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** YYYY-MM-DD for `<input type="date">`; maps legacy YYYY-MM values to the 1st. */
function dateFieldValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const month = /^(\d{4})-(\d{2})$/.exec(trimmed);
  return month ? `${month[1]}-${month[2]}-01` : "";
}

function parsePlanDate(value: string): Date | null {
  const input = dateFieldValue(value);
  if (!input) return null;
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Human label for the span between two plan dates. */
function planLengthLabel(begin: string, finish: string): string {
  const start = parsePlanDate(begin);
  const end = parsePlanDate(finish);
  if (!start || !end) return "—";
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return "—";
  if (days < 14) return `${days} d`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    const rest = days % 7;
    return rest === 0 ? `${weeks} wk` : `${weeks} wk ${rest} d`;
  }
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}

function nearestPalBand(pal: number): string | null {
  let best: (typeof PAL_OPTIONS)[number] | null = null;
  let distance = Infinity;
  for (const option of PAL_OPTIONS) {
    const next = Math.abs(option.value - pal);
    if (next < distance) {
      best = option;
      distance = next;
    }
  }
  return best?.label ?? null;
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

export function ClientPrescriptionPanel({
  base,
  allowManage,
  clinicMethod,
  client,
  latestMeasurements,
  onError,
}: Props) {
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
        const dietitianId = /\/dietitian\/([^/]+)\//.exec(base)?.[1];
        const [profile, settings] = await Promise.all([
          api<{ clinicalData?: ClinicalData }>(`${base}/profile`),
          dietitianId
            ? api<{ defaultNutritionMethod?: string }>(`/api/v1/dietitian/${dietitianId}/settings`).catch(
                () => null,
              )
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const method = clinicMethod ?? sanitizeNutritionMethod(settings?.defaultNutritionMethod);
        const storedMethod = profile.clinicalData?.prescription?.nutritionMethod;
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
            nutritionMethod: method,
            macro: { ...emptyPrescription().macro, ...(profile.clinicalData?.prescription?.macro ?? {}) },
            exchanges: {
              ...emptyFacultyExchanges(),
              ...(profile.clinicalData?.prescription?.exchanges ?? {}),
            },
          },
        };
        setClinical(merged);
        setLoaded(true);
        if (allowManage && storedMethod !== method) {
          void api(`${base}/profile`, {
            method: "PATCH",
            body: JSON.stringify({ clinicalData: merged }),
          }).catch((err) => onError(errorMessage(err, "Unable to save prescription")));
        }
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
  const isFaculty = isFacultyMethod(clinicMethod ?? rx.nutritionMethod);
  const bmrFormula: BmrFormulaId = isFaculty
    ? availableBmrFormulas.find((f) => f.id === "mifflin")?.id ??
      availableBmrFormulas.find((f) => f.id === DEFAULT_BMR_FORMULA)?.id ??
      availableBmrFormulas[0]?.id ??
      DEFAULT_BMR_FORMULA
    : availableBmrFormulas.some((f) => f.id === rx.bmrFormula)
      ? (rx.bmrFormula as BmrFormulaId)
      : availableBmrFormulas.find((f) => f.id === DEFAULT_BMR_FORMULA)?.id ??
        availableBmrFormulas[0]?.id ??
        DEFAULT_BMR_FORMULA;
  const palCurrent = rx.palCurrentKey || (isFaculty ? FACULTY_PAL_OPTIONS[0]!.key : DEFAULT_PAL_KEY);
  const palGoal = rx.palGoalKey || palCurrent;
  const palCurrentNumeric = isFaculty ? palValue(palCurrent) : (rx.palCurrentValue ?? palValue(palCurrent));
  const palGoalNumeric = palValue(palGoal);
  const ageYears = inputs.ageYears;
  const facultyIbw = computeFacultyIbw(inputs.heightCm, inputs.sex, ageYears);
  const facultyPctIbw = percentOf(weightKg, facultyIbw);
  const facultyAbw = computeFacultyAbw(weightKg, facultyIbw);
  const facultyUseAbw =
    isFaculty && rx.useAdjustedWeightForEnergy && facultyObeseForAbw(bmi, facultyPctIbw) && facultyAbw != null;
  const energyInputs: PrescriptionInputs = {
    ...inputs,
    weightKg: facultyUseAbw ? facultyAbw : inputs.weightKg,
  };
  const bmr = computeBmr(bmrFormula, energyInputs, currentBodyFat);
  const refBmr = computeBmr(bmrFormula, { ...inputs, weightKg: refWeight }, rx.bodyFatGoalPct ?? currentBodyFat);
  const energyFormula = (rx.energyFormula || DEFAULT_ENERGY_FORMULA) as EnergyFormulaId;
  const isEer = !isFaculty && energyFormula === "eer_iom";
  const tdeeCurrent = isEer
    ? computeEer(energyInputs, palCurrentNumeric)
    : bmr != null && palCurrentNumeric != null
      ? Math.round(bmr * palCurrentNumeric)
      : null;
  const tdeeGoalComputed = isEer ? computeEer(energyInputs, palGoalNumeric) : computeTdee(bmr, palGoal);
  const energyGoal = rx.energyGoalKcal ?? tdeeGoalComputed;
  const refTdee = isEer
    ? computeEer({ ...inputs, weightKg: refWeight }, palGoalNumeric)
    : computeTdee(refBmr, palGoal);
  const facultyWhr = computeWhr(inputs.waistCm, inputs.hipsCm);
  const facultyFrameRatio = computeFrameRatio(inputs.heightCm, measurementValue("WRIST"));
  const facultyFrame = facultyFrameSize(facultyFrameRatio, inputs.sex);
  const facultyPctUbw = percentOf(weightKg, rx.usualWeightKg);
  const facultyWeightChange = percentWeightChange(rx.usualWeightKg, weightKg);
  const facultyTally = tallyExchanges(rx.exchanges);

  const macro = {
    fatPct: rx.macro.fatPct ?? DEFAULT_MACRO_SPLIT.fatPct,
    carbPct: rx.macro.carbPct ?? DEFAULT_MACRO_SPLIT.carbPct,
    proteinPct: rx.macro.proteinPct ?? DEFAULT_MACRO_SPLIT.proteinPct,
  };
  const macroGrams = macroGramsFromEnergy(energyGoal, macro);
  const macroSum = roundTenth(macro.fatPct + macro.carbPct + macro.proteinPct);
  const fiberPerKg = gramsPerKg(rx.fiberGoalG, weightKg);

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
      const faculty = isFacultyMethod(clinicMethod ?? next.prescription.nutritionMethod);
      const facultyTargets = faculty ? facultyTargetsFromExchanges(next.prescription.exchanges) : null;
      const facultyPercents = faculty ? facultyMacroPercents(tallyExchanges(next.prescription.exchanges)) : null;
      const nextEnergy = faculty ? facultyTargets?.energyKcal ?? null : (next.prescription.energyGoalKcal ?? energyGoal);
      const grams = faculty
        ? {
            fatG: facultyTargets?.fatG ?? null,
            carbohydrateG: facultyTargets?.carbohydrateG ?? null,
            proteinG: facultyTargets?.proteinG ?? null,
          }
        : macroGramsFromEnergy(nextEnergy, {
            fatPct: next.prescription.macro.fatPct ?? DEFAULT_MACRO_SPLIT.fatPct,
            carbPct: next.prescription.macro.carbPct ?? DEFAULT_MACRO_SPLIT.carbPct,
            proteinPct: next.prescription.macro.proteinPct ?? DEFAULT_MACRO_SPLIT.proteinPct,
          });
      const withTargets: ClinicalData = {
        ...next,
        prescription: {
          ...next.prescription,
          nutritionMethod: clinicMethod ?? next.prescription.nutritionMethod,
          ...(faculty
            ? {
                energyGoalKcal: facultyTargets?.energyKcal ?? null,
                ...(facultyTargets?.energyKcal != null && facultyPercents
                  ? {
                      macro: {
                        fatPct: facultyPercents.fatPct,
                        carbPct: facultyPercents.carbPct,
                        proteinPct: facultyPercents.proteinPct,
                      },
                    }
                  : {}),
              }
            : {}),
        },
        nutrition: {
          ...next.nutrition,
          targets: {
            energyKcal: nextEnergy ?? null,
            fatG: grams.fatG,
            carbohydrateG: grams.carbohydrateG,
            proteinG: grams.proteinG,
            fiberG: faculty ? null : (next.prescription.fiberGoalG ?? null),
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

  useEffect(() => {
    if (!loaded || !clinicMethod || clinicMethod === rx.nutritionMethod) return;
    patchRx({ nutritionMethod: clinicMethod });
  }, [clinicMethod, loaded]);

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

  function patchExchange(id: FacultyExchangeId, value: number) {
    patchRx({ exchanges: { ...rx.exchanges, [id]: value } });
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

  function selectActivityMode(mode: "band" | "day") {
    if (mode === "band") {
      if (rx.palCurrentValue != null) patchRx({ palCurrentValue: null });
      return;
    }
    if (rx.palCurrentValue != null) return;
    const activities = typicalDayActivities(rx.activities);
    patchRx({ activities, palCurrentValue: palFromActivities(activities) });
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
        subtitle={
          isFaculty
            ? "Ideal and adjusted body weight for this method. You still set the goal weight."
            : "Measured now vs. your goal, with a healthy reference."
        }
        icon={<IconBody />}
      >
        <MetricTable>
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
              isFaculty ? (
                <Value muted>{facultyIbw != null ? `IBW ${fmt(facultyIbw)} kg` : "—"}</Value>
              ) : (
                <Value muted>
                  {refWeight != null ? `${fmt(refWeight)} kg` : "—"}
                  {weightDelta != null && weightDelta !== 0 ? (
                    <Badge tone={weightDelta < 0 ? "success" : "warning"}>
                      {Math.abs(weightDelta)} kg {weightDelta < 0 ? "to lose" : "to gain"}
                    </Badge>
                  ) : null}
                </Value>
              )
            }
          />

          {isFaculty ? (
            <>
              <Row
                name="Usual weight"
                current={
                  <NumberField
                    readOnly={readOnly}
                    value={rx.usualWeightKg}
                    unit="kg"
                    onChange={(v) => patchRx({ usualWeightKg: v })}
                  />
                }
                goal={<Value muted>—</Value>}
                reference={
                  <Value muted>
                    {facultyPctUbw != null ? `${fmt(facultyPctUbw)}% usual` : "—"}
                    {facultyWeightChange != null ? ` · ${fmt(facultyWeightChange)}% change` : ""}
                  </Value>
                }
              />
              <Row
                name="Ideal body weight"
                current={<Value>{facultyIbw != null ? `${fmt(facultyIbw)} kg` : "—"}</Value>}
                goal={<Value>{facultyPctIbw != null ? `${fmt(facultyPctIbw)}% IBW` : "—"}</Value>}
                reference={<Value muted>Hamwi, adults</Value>}
              />
              <Row
                name="Adjusted body weight"
                method={
                  <label className="ui-faculty__check">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={rx.useAdjustedWeightForEnergy}
                      onChange={(event) => patchRx({ useAdjustedWeightForEnergy: event.target.checked })}
                    />
                    <span>Use for energy if obese</span>
                  </label>
                }
                current={
                  <Value>
                    {facultyAbw != null ? `${fmt(facultyAbw)} kg` : "—"}
                    {facultyUseAbw ? <Badge tone="warning">used for energy</Badge> : null}
                  </Value>
                }
                goal={<Value muted>—</Value>}
                reference={<Value muted>%IBW ≥ 125 or BMI ≥ 30</Value>}
              />
              <Row
                name="Waist–hip / frame"
                current={
                  <Value>
                    {facultyWhr != null ? fmt(facultyWhr, 2) : "—"}
                    {facultyWhr != null && whrElevated(facultyWhr, inputs.sex) ? (
                      <Badge tone="warning">elevated</Badge>
                    ) : null}
                  </Value>
                }
                goal={<Value>{facultyFrame ?? "—"}</Value>}
                reference={
                  <Value muted>
                    {facultyFrameRatio != null ? `r ${fmt(facultyFrameRatio, 2)}` : "Waist, hips, wrist"}
                  </Value>
                }
              />
            </>
          ) : (
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
          )}

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
            reference={
              <Value muted>
                {isFaculty
                  ? facultyPctIbw != null
                    ? `${fmt(facultyPctIbw)}% IBW`
                    : "—"
                  : healthy != null
                    ? `${fmt(healthy.min)} – ${fmt(healthy.max)} kg`
                    : "18.5 – 24.9"}
              </Value>
            }
          />
        </MetricTable>
      </Section>

      {/* ── ENERGY NEEDS ── */}
      <Section
        title="Energy needs"
        subtitle={
          isFaculty
            ? "Estimated need uses Mifflin-St Jeor and the activity level above. Nutrition follows the exchange plan, not this estimate."
            : "Reference is calculated at a healthy body weight."
        }
        icon={<IconEnergy />}
      >
        <MetricTable>
          {/* Activity level */}
          <Row
            name="Activity level"
            method={
              isFaculty ? null : (
                <ActivityModeToggle
                  mode={rx.palCurrentValue != null ? "day" : "band"}
                  readOnly={readOnly}
                  onChange={selectActivityMode}
                />
              )
            }
            current={
              <span className="ui-prescription__activity">
                {!isFaculty && rx.palCurrentValue != null ? (
                  <>
                    <Value>
                      PAL {fmt(rx.palCurrentValue, 2)}
                      {nearestPalBand(rx.palCurrentValue) ? (
                        <span className="ui-prescription__activity-hint">≈ {nearestPalBand(rx.palCurrentValue)}</span>
                      ) : null}
                    </Value>
                    {!readOnly ? (
                      <button type="button" className="ui-prescription__link" onClick={() => setActivityOpen(true)}>
                        Edit typical day
                      </button>
                    ) : null}
                  </>
                ) : (
                  <PalSelect
                    method={clinicMethod ?? rx.nutritionMethod}
                    readOnly={readOnly}
                    value={isFaculty && !isFacultyPalKey(palCurrent) ? FACULTY_PAL_OPTIONS[0]!.key : palCurrent}
                    onChange={(value) => patchRx({ palCurrentKey: value })}
                    badge={`PAL ${palValue(isFaculty && !isFacultyPalKey(palCurrent) ? FACULTY_PAL_OPTIONS[0]!.key : palCurrent)}`}
                  />
                )}
              </span>
            }
            goal={
              <PalSelect
                method={clinicMethod ?? rx.nutritionMethod}
                readOnly={readOnly}
                value={isFaculty && !isFacultyPalKey(palGoal) ? FACULTY_PAL_OPTIONS[0]!.key : palGoal}
                onChange={(value) => patchRx({ palGoalKey: value })}
                badge={`PAL ${palValue(isFaculty && !isFacultyPalKey(palGoal) ? FACULTY_PAL_OPTIONS[0]!.key : palGoal)}`}
              />
            }
            reference={<Value muted>{isFaculty ? "Typical range 1.3–1.9" : "Typical range 1.2–2.2"}</Value>}
          />

          {/* BMR */}
          <Row
            name="Basal metabolic rate"
            method={
              isFaculty ? (
                <Value muted>Mifflin-St Jeor</Value>
              ) : availableBmrFormulas.length ? (
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
            name={isFaculty ? "Daily energy" : "Daily energy target"}
            method={
              isFaculty ? (
                <Value muted>Estimated need</Value>
              ) : (
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
              )
            }
            current={<Value>{tdeeCurrent != null ? `${fmt(tdeeCurrent, 0)} kcal` : "—"}</Value>}
            goal={
              isFaculty ? (
                <Value>
                  {facultyTally.atwaterKcal > 0 ? `${fmt(facultyTally.atwaterKcal, 0)} kcal` : "—"}
                  {facultyTally.atwaterKcal > 0 ? (
                    <span className="ui-prescription__subvalue">Exchange plan</span>
                  ) : null}
                </Value>
              ) : (
                <NumberField
                  readOnly={readOnly}
                  value={rx.energyGoalKcal}
                  unit="kcal"
                  placeholder={tdeeGoalComputed != null ? `${fmt(tdeeGoalComputed, 0)}` : "kcal"}
                  onChange={(v) => patchRx({ energyGoalKcal: v })}
                />
              )
            }
            reference={
              isFaculty ? (
                <Value muted>
                  {tdeeCurrent != null && facultyTally.atwaterKcal > 0
                    ? facultyPlanVsNeed(facultyTally.atwaterKcal, tdeeCurrent)
                    : "—"}
                </Value>
              ) : (
                <Value muted>{refTdee != null ? `${fmt(refTdee, 0)} kcal` : "—"}</Value>
              )
            }
          />
        </MetricTable>
      </Section>

      {/* ── MACRO / EXCHANGES ── */}
      {isFaculty ? (
      <Section
        title="Exchange plan"
        subtitle="Set the daily food-group plan. Nutrition Analysis uses these totals as the meal targets."
        icon={<IconMacros />}
      >
        <FacultyExchangeEditor
          exchanges={rx.exchanges ?? emptyFacultyExchanges()}
          readOnly={readOnly}
          onChange={patchExchange}
          needKcal={tdeeCurrent}
          hint="These totals become the Nutrition targets. The estimate above is only for comparison."
        />
      </Section>
      ) : (
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
            </div>
            <div className="ui-prescription__macro-foot">
              <label className="ui-prescription__perkg">
                <span className="ui-prescription__perkg-copy">
                  <span className="ui-prescription__perkg-label">Dietary fiber</span>
                  <span className="ui-prescription__perkg-hint">
                    {fiberPerKg != null
                      ? `${fmt(fiberPerKg, 2)} g/kg · typical ${FIBER_AI.min}–${FIBER_AI.max} g/day`
                      : `Typical adult intake ${FIBER_AI.min}–${FIBER_AI.max} g/day`}
                  </span>
                </span>
                <span className="ui-prescription__field ui-prescription__perkg-input">
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={rx.fiberGoalG ?? ""}
                    placeholder="28"
                    onChange={(event) => patchRx({ fiberGoalG: numberOrNull(event.target.value) })}
                  />
                  <span className="ui-prescription__unit">g</span>
                </span>
              </label>
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
      )}

      {!isFaculty ? (
        <ActivityDialog
          open={activityOpen}
          initial={rx.activities}
          onClose={() => setActivityOpen(false)}
          onApply={applyActivities}
        />
      ) : null}

      {/* ── DURATION ── */}
      <Section title="Duration" subtitle="Track the plan window and how long it runs." icon={<IconDuration />}>
        <div className="ui-prescription__duration">
          <label className="ui-prescription__duration-card">
            <span className="ui-prescription__duration-label">Begin</span>
            <Input
              type="date"
              disabled={readOnly}
              value={dateFieldValue(rx.beginDate)}
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
              type="date"
              disabled={readOnly}
              value={dateFieldValue(rx.forecastFinishDate)}
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
  badge,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ui-prescription__section">
      <div className="ui-prescription__section-head">
        {icon ? <span className="ui-prescription__section-icon">{icon}</span> : null}
        <div className="ui-prescription__section-heading">
          <h3 className="ui-prescription__section-title">
            {title}
            {badge ? <Badge tone="success">{badge}</Badge> : null}
          </h3>
          {subtitle ? <p className="ui-prescription__section-sub">{subtitle}</p> : null}
        </div>
      </div>
      <div className="ui-prescription__section-body">{children}</div>
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

function ActivityModeToggle({
  mode,
  readOnly,
  onChange,
}: {
  mode: "band" | "day";
  readOnly: boolean;
  onChange: (mode: "band" | "day") => void;
}) {
  return (
    <span className="ui-prescription__method">
      <span className="ui-prescription__method-label">How to set current</span>
      <span className="ui-segment ui-prescription__activity-mode" role="tablist" aria-label="How to set current activity level">
        <button
          type="button"
          role="tab"
          className={`ui-segment__btn${mode === "band" ? " is-active" : ""}`}
          disabled={readOnly}
          aria-selected={mode === "band"}
          onClick={() => onChange("band")}
        >
          Lifestyle
        </button>
        <button
          type="button"
          role="tab"
          className={`ui-segment__btn${mode === "day" ? " is-active" : ""}`}
          disabled={readOnly}
          aria-selected={mode === "day"}
          onClick={() => onChange("day")}
        >
          Typical day
        </button>
      </span>
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

function PalSelect({
  value,
  badge,
  readOnly,
  method,
  onChange,
}: {
  value: string;
  badge?: string;
  readOnly: boolean;
  method: NutritionMethod;
  onChange: (value: string) => void;
}) {
  const faculty = isFacultyMethod(method);
  const options = faculty ? FACULTY_PAL_OPTIONS : PAL_OPTIONS;
  return (
    <span className="ui-prescription__field">
      <Select disabled={readOnly} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
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
const COMPENDIUM_GROUP = new Map(ACTIVITY_COMPENDIUM.map((a) => [a.key, a.group]));

function activityLabel(key: string): string {
  return COMPENDIUM_LABEL.get(key) ?? "Custom activity";
}

function activityGroup(key: string): string {
  return COMPENDIUM_GROUP.get(key) ?? "Other";
}

function formatLoggedTime(totalMin: number): string {
  const hours = Math.floor(Math.max(0, totalMin) / 60);
  const mins = Math.round(Math.max(0, totalMin) % 60);
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
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

function typicalDayActivities(existing: PrescriptionActivity[]): PrescriptionActivity[] {
  if (existing.length > 0) return existing;
  return DEFAULT_DAY.map((entry) => ({
    key: entry.key,
    met: compendiumMet(entry.key),
    minutes: entry.minutes,
  }));
}

function seedRows(initial: PrescriptionActivity[]): ActivityRow[] {
  const source =
    initial.length > 0
      ? initial.map((entry) => ({ key: entry.key, met: entry.met, minutes: entry.minutes }))
      : DEFAULT_DAY.map((entry) => ({ key: entry.key, met: compendiumMet(entry.key), minutes: entry.minutes }));
  return source.map((entry) => ({ id: nextRowId(), ...entry }));
}

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

  useEffect(() => {
    if (open) {
      setRows(seedRows(initial));
      setAdding(false);
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entries: PrescriptionActivity[] = rows.map((r) => ({ key: r.key, met: r.met, minutes: r.minutes }));
  const pal = palFromActivities(entries);
  const totalMin = totalActivityMinutes(entries);
  const dayComplete = Math.abs(totalMin - 1440) <= 15;
  const progressPct = Math.min(100, (totalMin / 1440) * 100);
  const bandHint = pal != null ? nearestPalBand(pal) : null;

  function setRow(id: string, patch: Partial<ActivityRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function setMinutes(id: string, hours: number, minutes: number) {
    setRow(id, { minutes: Math.max(0, Math.round(hours * 60 + minutes)) });
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addActivity(activity: ActivityMet) {
    setRows((prev) => {
      const existing = prev.find((row) => row.key === activity.key);
      if (existing) {
        return prev.map((row) =>
          row.id === existing.id ? { ...row, minutes: (row.minutes ?? 0) + 30 } : row,
        );
      }
      return [...prev, { id: nextRowId(), key: activity.key, met: activity.met, minutes: 30 }];
    });
    setAdding(false);
  }

  return (
    <Dialog
      open={open}
      title={adding ? "Add activity" : "Typical day"}
      onClose={onClose}
      className="ui-activity-dialog"
    >
      {adding ? (
        <ActivityPicker query={query} onQuery={setQuery} onAdd={addActivity} onBack={() => setAdding(false)} />
      ) : (
        <div className="ui-activity">
          <div className="ui-activity__hero">
            <div className="ui-activity__stat">
              <span className="ui-activity__stat-label">Logged</span>
              <strong className={dayComplete ? undefined : "is-warn"}>{formatLoggedTime(totalMin)}</strong>
              <span className="ui-activity__stat-hint">of 24h 00m</span>
            </div>
            <div className="ui-activity__stat">
              <span className="ui-activity__stat-label">Activity level</span>
              <strong>{pal != null ? pal.toFixed(2) : "—"}</strong>
              <span className="ui-activity__stat-hint">{bandHint ? `≈ ${bandHint}` : "PAL from this day"}</span>
            </div>
            <div className="ui-activity__meter" aria-hidden="true">
              <span className="ui-activity__meter-label">24-hour day</span>
              <span className={`ui-activity__meter-track${dayComplete ? "" : " is-short"}`}>
                <span className="ui-activity__meter-fill" style={{ width: `${progressPct}%` }} />
              </span>
            </div>
          </div>

          <div className="ui-activity__table" role="table">
            <div className="ui-activity__hrow" role="row">
              <span>Activity</span>
              <span>Duration</span>
              <span>MET</span>
              <span className="ui-activity__sr-only">Remove</span>
            </div>
            {rows.length === 0 ? (
              <p className="ui-activity__empty">No activities yet. Add sleep, work, and movement to fill the day.</p>
            ) : (
              rows.map((row) => {
                const hours = Math.floor((row.minutes ?? 0) / 60);
                const mins = (row.minutes ?? 0) % 60;
                const isCustom = !COMPENDIUM_LABEL.has(row.key) || row.key === "other";
                return (
                  <div className="ui-activity__row" role="row" key={row.id}>
                    <span className="ui-activity__identity">
                      <span className="ui-activity__name" title={activityLabel(row.key)}>
                        {activityLabel(row.key)}
                      </span>
                      <span className="ui-activity__group">{activityGroup(row.key)}</span>
                    </span>
                    <span className="ui-activity__time">
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        step={1}
                        aria-label={`${activityLabel(row.key)} hours`}
                        value={hours}
                        onChange={(event) => setMinutes(row.id, numberOrNull(event.target.value) ?? 0, mins)}
                      />
                      <span className="ui-activity__unit">h</span>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        step={5}
                        aria-label={`${activityLabel(row.key)} minutes`}
                        value={mins}
                        onChange={(event) => setMinutes(row.id, hours, numberOrNull(event.target.value) ?? 0)}
                      />
                      <span className="ui-activity__unit">m</span>
                    </span>
                    <span className="ui-activity__met">
                      {isCustom ? (
                        <Input
                          type="number"
                          min={0}
                          step="0.1"
                          aria-label={`${activityLabel(row.key)} MET`}
                          value={row.met ?? ""}
                          onChange={(event) => setRow(row.id, { met: numberOrNull(event.target.value) })}
                        />
                      ) : (
                        <span>{row.met != null ? row.met.toFixed(1) : "—"}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="ui-activity__remove"
                      aria-label={`Remove ${activityLabel(row.key)}`}
                      onClick={() => removeRow(row.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="ui-activity__toolbar">
            <button
              type="button"
              className="ui-activity__add"
              onClick={() => {
                setQuery("");
                setAdding(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add activity
            </button>
            {!dayComplete ? (
              <span className="ui-activity__balance">
                {totalMin < 1440
                  ? `${formatLoggedTime(1440 - totalMin)} still needed`
                  : `${formatLoggedTime(totalMin - 1440)} over 24h`}
              </span>
            ) : (
              <span className="ui-activity__balance is-ok">Day adds up to 24 hours</span>
            )}
          </div>

          <div className="ui-activity__foot">
            <p className="ui-activity__note">
              PAL is the time-weighted average MET for this day. Goal activity still uses a lifestyle band.
            </p>
            <div className="ui-activity__buttons">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" disabled={pal == null} onClick={() => onApply(entries, pal)}>
                Use this PAL
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ActivityPicker({
  query,
  onQuery,
  onAdd,
  onBack,
}: {
  query: string;
  onQuery: (value: string) => void;
  onAdd: (activity: ActivityMet) => void;
  onBack: () => void;
}) {
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? ACTIVITY_COMPENDIUM.filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q))
      : ACTIVITY_COMPENDIUM;
    const map = new Map<string, ActivityMet[]>();
    for (const activity of list) {
      const next = map.get(activity.group) ?? [];
      next.push(activity);
      map.set(activity.group, next);
    }
    return Array.from(map.entries());
  }, [query]);

  return (
    <div className="ui-activity-picker">
      <div className="ui-activity-picker__head">
        <button type="button" className="ui-activity-picker__back" onClick={onBack}>
          Typical day
        </button>
        <p className="ui-activity-picker__lead">Adds 30 minutes — adjust duration on the day log.</p>
      </div>
      <div className="ui-activity-picker__search">
        <Input
          type="search"
          placeholder="Search sleep, work, walking…"
          value={query}
          autoFocus
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <div className="ui-activity-picker__list">
        {grouped.length === 0 ? (
          <p className="ui-activity__empty">No activities match “{query}”.</p>
        ) : (
          grouped.map(([group, activities]) => (
            <section className="ui-activity-picker__section" key={group}>
              <h3 className="ui-activity-picker__group">{group}</h3>
              {activities.map((activity) => (
                <div className="ui-activity-picker__row" key={activity.key}>
                  <span className="ui-activity-picker__info">
                    <span className="ui-activity-picker__name">{activity.label}</span>
                    <span className="ui-activity-picker__met">{activity.met.toFixed(1)} MET</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onAdd(activity)}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </section>
          ))
        )}
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
