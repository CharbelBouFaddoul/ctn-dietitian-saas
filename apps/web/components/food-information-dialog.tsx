"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Badge, Button, ConfirmDialog, Dialog, LoadingState, Select } from "@nutrition-saas/ui";
import { MICRONUTRIENT_DEFS, type ExtraNutrients, type MicronutrientKey } from "../lib/micronutrients";
import { api } from "../lib/api";
import { errorMessage } from "../lib/humanize-error";
import { unitLabel } from "../lib/practice-labels";

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

export interface EffectiveFood {
  id: string;
  name: string;
  category: string | null;
  servingDescription: string | null;
  referenceQuantity: number;
  referenceUnit: string;
  sourceFoodId: string;
  origin?: "catalog" | "custom";
  dietitianAccountId?: string | null;
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
  extraNutrients?: ExtraNutrients;
  presentedExtraNutrients?: ExtraNutrients;
}

interface CalculateResult {
  nutrition: NutritionValues;
  presented: NutritionValues;
  presentedExtraNutrients?: ExtraNutrients;
}

interface EditForm {
  name: string;
  category: string;
  servingDescription: string;
  referenceQuantity: string;
  referenceUnit: "g" | "ml";
  nutrition: Record<NutrientKey, string>;
  extras: Record<MicronutrientKey, string>;
}

const MACROS: Array<{ key: NutrientKey; label: string; unit: string }> = [
  { key: "energyKcal", label: "Energy", unit: "kcal" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "carbohydrateG", label: "Carbohydrate", unit: "g" },
  { key: "proteinG", label: "Protein", unit: "g" },
];

const EXTRA_MACROS: Array<{ key: NutrientKey; label: string; unit: string }> = [
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sugarG", label: "Sugars", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
];

const NUTRIENT_KEYS: NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
];

const IconPencil = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M11.2 2.8a1.3 1.3 0 0 1 1.8 1.8L6.2 11.4 3.5 12l.6-2.7z"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
  </svg>
);

const IconTrash = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M18 7l-.7 12.1a1.5 1.5 0 0 1-1.5 1.4H8.2a1.5 1.5 0 0 1-1.5-1.4L6 7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function fmtVal(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function numToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseNum(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function emptyExtras(): Record<MicronutrientKey, string> {
  const extras = {} as Record<MicronutrientKey, string>;
  for (const def of MICRONUTRIENT_DEFS) extras[def.key] = "";
  return extras;
}

function formFromFood(food: EffectiveFood): EditForm {
  const extras = emptyExtras();
  const stored = food.extraNutrients ?? {};
  for (const def of MICRONUTRIENT_DEFS) {
    extras[def.key] = numToInput(stored[def.key]);
  }
  const nutrition = food.effectiveNutrition;
  return {
    name: food.name,
    category: food.category ?? "",
    servingDescription: food.servingDescription ?? "",
    referenceQuantity: String(food.referenceQuantity),
    referenceUnit: food.referenceUnit === "ml" ? "ml" : "g",
    nutrition: {
      energyKcal: numToInput(nutrition.energyKcal),
      proteinG: numToInput(nutrition.proteinG),
      carbohydrateG: numToInput(nutrition.carbohydrateG),
      fatG: numToInput(nutrition.fatG),
      fiberG: numToInput(nutrition.fiberG),
      sugarG: numToInput(nutrition.sugarG),
      sodiumMg: numToInput(nutrition.sodiumMg),
    },
    extras,
  };
}

export function FoodInformationDialog({
  foodId,
  dietitianAccountId,
  canMutate = false,
  onClose,
  onChanged,
  onFoodIdChange,
}: {
  foodId: string;
  dietitianAccountId?: string;
  canMutate?: boolean;
  onClose: () => void;
  onChanged?: () => void;
  onFoodIdChange?: (foodId: string) => void;
}) {
  const foodsBase = dietitianAccountId
    ? `/api/v1/dietitian/${dietitianAccountId}/foods`
    : "/api/v1/portal/foods";
  const allowMutate = Boolean(dietitianAccountId && canMutate);
  const [food, setFood] = useState<EffectiveFood | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [viewMode, setViewMode] = useState<"reference" | "quantity">("reference");
  const [calculated, setCalculated] = useState<CalculateResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const keepNoticeRef = useRef<string | null>(null);

  async function load(id = foodId) {
    setError(null);
    const detail = await api<EffectiveFood>(`${foodsBase}/${id}`);
    setFood(detail);
    setForm(formFromFood(detail));
    setQuantity(String(detail.referenceQuantity));
    setUnit(detail.referenceUnit);
    setViewMode("reference");
    setCalculated(null);
    setEditing(false);
    setConfirmSave(false);
    setConfirmDelete(false);
  }

  useEffect(() => {
    setFood(null);
    setForm(null);
    setError(null);
    setEditing(false);
    setConfirmSave(false);
    setConfirmDelete(false);
    if (keepNoticeRef.current !== foodId) setNotice(null);
    void load(foodId).catch((err) => setError(errorMessage(err, "Unable to load food")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodsBase, foodId]);

  const isCustom = food?.origin === "custom";
  const canEdit = Boolean(isCustom && allowMutate);
  const unitOptions = food?.referenceUnit === "g" ? ["g", "kg", "oz", "lb"] : ["ml", "l", "fl_oz"];
  const sourceLabel = food
    ? food.origin === "custom"
      ? "Clinic custom food"
      : [food.source.name, food.source.datasetVersion].filter(Boolean).join(", ")
    : "";

  const displayedNutrition: NutritionValues | null = useMemo(() => {
    if (!food) return null;
    if (viewMode === "quantity" && calculated) return calculated.presented;
    return food.presentedEffectiveNutrition;
  }, [food, viewMode, calculated]);

  const displayedExtras: ExtraNutrients = useMemo(() => {
    if (viewMode === "quantity" && calculated?.presentedExtraNutrients) {
      return calculated.presentedExtraNutrients;
    }
    return food?.presentedExtraNutrients ?? food?.extraNutrients ?? {};
  }, [food, viewMode, calculated]);

  async function runCalculate(nextQty: string, nextUnit: string) {
    if (!food) return;
    const qty = Number(nextQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setCalcBusy(true);
    setError(null);
    try {
      const result = await api<CalculateResult>(
        `${foodsBase}/${food.id}/calculate`,
        { method: "POST", body: JSON.stringify({ quantity: qty, unit: nextUnit }) },
      );
      setCalculated(result);
    } catch (err) {
      setError(errorMessage(err, "Calculation failed"));
    } finally {
      setCalcBusy(false);
    }
  }

  function selectReference() {
    if (!food || editing) return;
    setViewMode("reference");
    setQuantity(String(food.referenceQuantity));
    setUnit(food.referenceUnit);
    setCalculated(null);
  }

  function selectQuantity() {
    if (editing) return;
    setViewMode("quantity");
    void runCalculate(quantity, unit);
  }

  function startEdit() {
    if (!food || !canEdit) return;
    setError(null);
    setNotice(null);
    setForm(formFromFood(food));
    setViewMode("reference");
    setCalculated(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (food) setForm(formFromFood(food));
    setEditing(false);
    setConfirmSave(false);
    setError(null);
  }

  function requestSave() {
    if (!form) return;
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    const qty = Number(form.referenceQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    setError(null);
    setConfirmSave(true);
  }

  async function duplicateFood() {
    if (!food) return;
    setDuplicateBusy(true);
    setError(null);
    setNotice(null);
    try {
      const copy = await api<{ id: string }>(`${foodsBase}/${food.id}/duplicate`, {
        method: "POST",
      });
      keepNoticeRef.current = copy.id;
      setNotice("Duplicated to your clinic. Use Edit to change values.");
      onChanged?.();
      onFoodIdChange?.(copy.id);
    } catch (err) {
      setError(errorMessage(err, "Could not duplicate food"));
    } finally {
      setDuplicateBusy(false);
    }
  }

  async function saveCustom() {
    if (!food || !form) return;
    const qty = Number(form.referenceQuantity);
    const extraNutrients: ExtraNutrients = {};
    for (const def of MICRONUTRIENT_DEFS) {
      extraNutrients[def.key] = parseNum(form.extras[def.key]);
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      servingDescription: form.servingDescription.trim() || null,
      referenceQuantity: qty,
      referenceUnit: form.referenceUnit,
      extraNutrients,
    };
    for (const key of NUTRIENT_KEYS) {
      payload[key] = parseNum(form.nutrition[key]);
    }
    setSaveBusy(true);
    setError(null);
    try {
      const updated = await api<EffectiveFood>(`${foodsBase}/${food.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setFood(updated);
      setForm(formFromFood(updated));
      setQuantity(String(updated.referenceQuantity));
      setUnit(updated.referenceUnit);
      setEditing(false);
      setConfirmSave(false);
      setNotice("Saved.");
      onChanged?.();
    } catch (err) {
      setConfirmSave(false);
      setError(errorMessage(err, "Unable to save food"));
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteCustom() {
    if (!food) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api(`${foodsBase}/${food.id}/archive`, { method: "POST" });
      onChanged?.();
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setError(errorMessage(err, "Unable to delete food"));
    } finally {
      setDeleteBusy(false);
    }
  }

  function patchForm(next: Partial<EditForm>) {
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  function patchNutrition(key: NutrientKey, value: string) {
    setForm((current) =>
      current ? { ...current, nutrition: { ...current.nutrition, [key]: value } } : current,
    );
  }

  function patchExtra(key: MicronutrientKey, value: string) {
    setForm((current) =>
      current ? { ...current, extras: { ...current.extras, [key]: value } } : current,
    );
  }

  return (
    <>
      <Dialog open title="Food information" onClose={onClose} className="ui-food-info">
        {!food ? (
          <div className="ui-food-info__layout">
            <div className="ui-food-info__scroll">
              {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading food…</LoadingState>}
            </div>
          </div>
        ) : (
          <div className="ui-food-info__layout">
            <div className="ui-food-info__scroll">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {notice ? <Alert tone="success">{notice}</Alert> : null}

              <section className="ui-food-info__general">
                <div className="ui-food-info__facts">
                  <Fact label="Name" value={food.name} editing={editing}>
                    <input
                      className="ui-input"
                      value={form?.name ?? ""}
                      aria-label="Name"
                      onChange={(event) => patchForm({ name: event.target.value })}
                    />
                  </Fact>
                  <Fact label="Source" value={sourceLabel || "—"} />
                  <Fact label="Group" value={food.category || "—"} editing={editing}>
                    <input
                      className="ui-input"
                      value={form?.category ?? ""}
                      aria-label="Group"
                      onChange={(event) => patchForm({ category: event.target.value })}
                    />
                  </Fact>
                  {editing ? (
                    <Fact label="Quantity" editing>
                      <div className="ui-food-info__qty">
                        <input
                          className="ui-input"
                          type="number"
                          min="0.001"
                          step="any"
                          value={form?.referenceQuantity ?? ""}
                          aria-label="Reference quantity"
                          onChange={(event) => patchForm({ referenceQuantity: event.target.value })}
                        />
                        <Select
                          aria-label="Reference unit"
                          value={form?.referenceUnit ?? "g"}
                          onChange={(event) =>
                            patchForm({ referenceUnit: event.target.value === "ml" ? "ml" : "g" })
                          }
                        >
                          <option value="g">{unitLabel("g") || "g"}</option>
                          <option value="ml">{unitLabel("ml") || "ml"}</option>
                        </Select>
                      </div>
                    </Fact>
                  ) : viewMode === "reference" ? (
                    <Fact
                      label="Quantity"
                      value={`${food.referenceQuantity} ${unitLabel(food.referenceUnit)}`}
                    />
                  ) : (
                    <div className="ui-food-info__fact">
                      <span className="ui-food-info__fact-label">Quantity</span>
                      <div className="ui-food-info__qty">
                        <input
                          className="ui-input"
                          type="number"
                          min="0.001"
                          step="any"
                          value={quantity}
                          aria-label="Quantity"
                          onChange={(event) => setQuantity(event.target.value)}
                        />
                        <Select
                          aria-label="Unit"
                          value={unit}
                          onChange={(event) => setUnit(event.target.value)}
                        >
                          {unitOptions.map((option) => (
                            <option key={option} value={option}>
                              {unitLabel(option) || option}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={calcBusy}
                          onClick={() => void runCalculate(quantity, unit)}
                        >
                          {calcBusy ? "…" : "Go"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="ui-food-info__serving-field">
                    <span className="ui-food-info__fact-label">Serving</span>
                    <input
                      className="ui-input"
                      value={form?.servingDescription ?? ""}
                      aria-label="Serving description"
                      onChange={(event) => patchForm({ servingDescription: event.target.value })}
                    />
                  </div>
                ) : food.servingDescription ? (
                  <p className="ui-food-info__serving">Serving: {food.servingDescription}</p>
                ) : null}
                <div className="ui-food-info__badge">
                  {isCustom ? <Badge tone="accent">Custom</Badge> : <Badge tone="neutral">Catalog</Badge>}
                </div>
              </section>

              <div className="ui-food-info__modes" role="tablist" aria-label="Nutrition basis">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "reference"}
                  className={`ui-food-info__mode${viewMode === "reference" ? " is-active" : ""}`}
                  onClick={selectReference}
                >
                  Nutritional value per {editing ? form?.referenceQuantity : food.referenceQuantity}{" "}
                  {unitLabel(editing ? form?.referenceUnit ?? food.referenceUnit : food.referenceUnit)}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "quantity"}
                  className={`ui-food-info__mode${viewMode === "quantity" ? " is-active" : ""}`}
                  disabled={editing}
                  onClick={selectQuantity}
                >
                  Common measures
                </button>
              </div>

              <section className="ui-food-info__block">
                <h3>Macronutrients</h3>
                <div className="ui-food-info__macros">
                  {MACROS.map((item) => (
                    <Stat
                      key={item.key}
                      label={item.label}
                      value={fmtVal(displayedNutrition?.[item.key])}
                      unit={item.unit}
                      editing={editing}
                      inputValue={form?.nutrition[item.key] ?? ""}
                      onChange={(value) => patchNutrition(item.key, value)}
                    />
                  ))}
                </div>
              </section>

              <section className="ui-food-info__block">
                <h3>Micronutrients</h3>
                <div className="ui-food-info__micros">
                  {EXTRA_MACROS.map((item) => (
                    <Stat
                      key={item.key}
                      label={item.label}
                      value={fmtVal(displayedNutrition?.[item.key])}
                      unit={item.unit}
                      editing={editing}
                      inputValue={form?.nutrition[item.key] ?? ""}
                      onChange={(value) => patchNutrition(item.key, value)}
                    />
                  ))}
                  {MICRONUTRIENT_DEFS.map((item) => (
                    <Stat
                      key={item.key}
                      label={item.label}
                      value={fmtVal(displayedExtras[item.key])}
                      unit={item.unit}
                      editing={editing}
                      inputValue={form?.extras[item.key] ?? ""}
                      onChange={(value) => patchExtra(item.key, value)}
                    />
                  ))}
                </div>
              </section>
            </div>

            <div className="ui-food-info__foot">
              <Button type="button" variant="secondary" onClick={editing ? cancelEdit : onClose}>
                {editing ? "Cancel" : "Close"}
              </Button>
              <div className="ui-food-info__actions">
                {canEdit && !editing ? (
                  <>
                    <button
                      type="button"
                      className="ui-food-info__icon-btn ui-food-info__icon-btn--danger"
                      aria-label="Delete"
                      title="Delete"
                      onClick={() => setConfirmDelete(true)}
                    >
                      {IconTrash}
                    </button>
                    <button
                      type="button"
                      className="ui-food-info__icon-btn"
                      aria-label="Edit"
                      title="Edit"
                      onClick={startEdit}
                    >
                      {IconPencil}
                    </button>
                  </>
                ) : null}
                {canEdit && editing ? (
                  <Button type="button" disabled={saveBusy} onClick={requestSave}>
                    Save
                  </Button>
                ) : null}
                {!isCustom && allowMutate ? (
                  <Button type="button" disabled={duplicateBusy} onClick={() => void duplicateFood()}>
                    {duplicateBusy ? "Duplicating…" : "Duplicate to edit"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this food?"
        description={
          food
            ? `“${food.name}” will be removed from your clinic foods. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        pending={deleteBusy}
        onConfirm={() => void deleteCustom()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmSave}
        title="Save changes?"
        description={
          form ? `Update “${form.name.trim() || "this food"}” with the values you entered.` : undefined
        }
        confirmLabel="Save"
        pending={saveBusy}
        onConfirm={() => void saveCustom()}
        onCancel={() => setConfirmSave(false)}
      />
    </>
  );
}

function Fact({
  label,
  value,
  editing = false,
  children,
}: {
  label: string;
  value?: string;
  editing?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="ui-food-info__fact">
      <span className="ui-food-info__fact-label">{label}</span>
      {editing ? children : <span className="ui-food-info__fact-value">{value}</span>}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  editing = false,
  inputValue = "",
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  editing?: boolean;
  inputValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className={`ui-food-info__stat${editing ? " is-edit" : ""}`}>
      <span className="ui-food-info__stat-label">{label}</span>
      {editing ? (
        <span className="ui-food-info__stat-readout">
          <input
            className="ui-input"
            type="number"
            min="0"
            step="any"
            value={inputValue}
            aria-label={label}
            onChange={(event) => onChange?.(event.target.value)}
          />
          <span>{unit}</span>
        </span>
      ) : (
        <span className="ui-food-info__stat-readout">
          <strong>{value}</strong>
          <span>{unit}</span>
        </span>
      )}
    </div>
  );
}
