"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Section,
  Select,
  Table,
  Td,
} from "@nutrition-saas/ui";
import { MICRONUTRIENT_DEFS, type ExtraNutrients, type MicronutrientKey } from "../../../../../lib/micronutrients";
import { ExtraNutrientTables } from "../../../../../lib/extra-nutrient-tables";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";
import { unitLabel } from "../../../../../lib/practice-labels";
import { usePractice } from "../../practice-shell";

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

const NUTRIENTS: Array<{ key: NutrientKey; label: string; unit: string }> = [
  { key: "energyKcal", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbohydrateG", label: "Carbohydrates", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sugarG", label: "Sugar", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
];

function fmtVal(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  return Number(t);
}

function emptyExtras(): Record<MicronutrientKey, string> {
  const init = {} as Record<MicronutrientKey, string>;
  for (const def of MICRONUTRIENT_DEFS) init[def.key] = "";
  return init;
}

export default function FoodDetailPage() {
  const params = useParams<{ dietitianAccountId: string; foodId: string }>();
  const { dietitianAccountId, foodId } = params;
  const router = useRouter();
  const practice = usePractice();
  const [food, setFood] = useState<EffectiveFood | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [servingDescription, setServingDescription] = useState("");
  const [referenceQuantity, setReferenceQuantity] = useState("100");
  const [referenceUnit, setReferenceUnit] = useState("g");
  const [macros, setMacros] = useState<Record<NutrientKey, string>>({
    energyKcal: "",
    proteinG: "",
    carbohydrateG: "",
    fatG: "",
    fiberG: "",
    sugarG: "",
    sodiumMg: "",
  });
  const [extras, setExtras] = useState<Record<MicronutrientKey, string>>(emptyExtras);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState("g");
  const [calculated, setCalculated] = useState<CalculateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);

  const canMutate = practice.role === "OWNER" || practice.role === "DIETITIAN";

  const groups = useMemo(
    () =>
      (["lipids", "minerals", "vitamins"] as const).map((group) => ({
        group,
        label: group === "lipids" ? "Lipids" : group === "minerals" ? "Minerals" : "Vitamins",
        items: MICRONUTRIENT_DEFS.filter((d) => d.group === group),
      })),
    [],
  );

  async function load() {
    setError(null);
    const detail = await api<EffectiveFood>(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}`);
    setFood(detail);
    setName(detail.name);
    setCategory(detail.category ?? "");
    setServingDescription(detail.servingDescription ?? "");
    setReferenceQuantity(String(detail.referenceQuantity));
    setReferenceUnit(detail.referenceUnit);
    setQuantity(String(detail.referenceQuantity));
    setUnit(detail.referenceUnit);
    const nextMacros = { ...macros };
    for (const item of NUTRIENTS) {
      const value = detail.presentedEffectiveNutrition[item.key];
      nextMacros[item.key] = value == null ? "" : String(value);
    }
    setMacros(nextMacros);
    const nextExtras = emptyExtras();
    const extraValues = detail.presentedExtraNutrients ?? detail.extraNutrients ?? {};
    for (const def of MICRONUTRIENT_DEFS) {
      const value = extraValues[def.key];
      nextExtras[def.key] = value == null ? "" : String(value);
    }
    setExtras(nextExtras);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load food")));
  }, [dietitianAccountId, foodId]);

  async function saveCustom(event: FormEvent) {
    event.preventDefault();
    setSaveBusy(true);
    setError(null);
    setNotice(null);
    try {
      const extraNutrients: Record<string, number | null> = {};
      for (const def of MICRONUTRIENT_DEFS) {
        const v = numOrNull(extras[def.key]);
        if (v !== null) extraNutrients[def.key] = v;
      }
      await api(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          category: category || null,
          servingDescription: servingDescription || null,
          referenceQuantity: Number(referenceQuantity),
          referenceUnit,
          energyKcal: numOrNull(macros.energyKcal),
          proteinG: numOrNull(macros.proteinG),
          carbohydrateG: numOrNull(macros.carbohydrateG),
          fatG: numOrNull(macros.fatG),
          fiberG: numOrNull(macros.fiberG),
          sugarG: numOrNull(macros.sugarG),
          sodiumMg: numOrNull(macros.sodiumMg),
          extraNutrients,
        }),
      });
      setNotice("Custom food saved.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not save food"));
    } finally {
      setSaveBusy(false);
    }
  }

  async function duplicateFood() {
    setDuplicateBusy(true);
    setError(null);
    setNotice(null);
    try {
      const copy = await api<{ id: string }>(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}/duplicate`, {
        method: "POST",
      });
      router.push(`/practice/${dietitianAccountId}/foods/${copy.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not duplicate food"));
      setDuplicateBusy(false);
    }
  }

  async function archiveCustom() {
    setError(null);
    setNotice(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}/archive`, { method: "POST" });
      router.push(`/practice/${dietitianAccountId}/foods`);
    } catch (err) {
      setError(errorMessage(err, "Unable to archive"));
    }
  }

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<CalculateResult>(
        `/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}/calculate`,
        {
          method: "POST",
          body: JSON.stringify({ quantity: Number(quantity), unit }),
        },
      );
      setCalculated(result);
    } catch (err) {
      setError(errorMessage(err, "Calculation failed"));
    }
  }

  if (!food) {
    return (
      <section>
        {error ? <Alert tone="danger">{error}</Alert> : <LoadingState>Loading food…</LoadingState>}
      </section>
    );
  }

  const unitOptions =
    food.referenceUnit === "g" ? ["g", "kg", "oz", "lb"] : ["ml", "l", "fl_oz"];

  const metaParts: string[] = [`${food.referenceQuantity} ${unitLabel(food.referenceUnit)}`];
  if (food.servingDescription) metaParts.push(food.servingDescription);
  if (food.category) metaParts.push(food.category);

  const isCustom = food.origin === "custom";
  const canEdit = isCustom && canMutate;
  const presentedExtras = food.presentedExtraNutrients ?? food.extraNutrients ?? {};

  return (
    <section className="ui-stack" style={{ gap: 20, width: "100%" }}>
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/foods`, label: "Food database" },
          { label: food.name },
        ]}
      />

      <PageHeader
        title={food.name}
        description={metaParts.join(" · ")}
        actions={
          <div className="ui-row">
            {isCustom ? <Badge tone="accent">Custom</Badge> : <Badge tone="neutral">Catalog</Badge>}
            {!isCustom && canMutate ? (
              <Button size="sm" disabled={duplicateBusy} onClick={() => void duplicateFood()}>
                {duplicateBusy ? "Duplicating…" : "Duplicate to clinic"}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {canEdit ? (
        <form className="ui-stack" onSubmit={(e) => void saveCustom(e)} style={{ width: "100%", gap: 20 }}>
          <Section title="Basics" description="Clinic-private food. Edits never change the shared catalog.">
            <div className="ui-stack" style={{ gap: 16 }}>
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Category">
                <Input value={category} onChange={(e) => setCategory(e.target.value)} />
              </Field>
              <Field label="Serving description">
                <Input value={servingDescription} onChange={(e) => setServingDescription(e.target.value)} />
              </Field>
              <div className="ui-grid">
                <Field label="Reference quantity">
                  <Input
                    type="number"
                    step="any"
                    value={referenceQuantity}
                    onChange={(e) => setReferenceQuantity(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Unit">
                  <Select value={referenceUnit} onChange={(e) => setReferenceUnit(e.target.value)}>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                  </Select>
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Macros" description="Per reference amount above.">
            <div className="ui-grid">
              {NUTRIENTS.map((item) => (
                <Field key={item.key} label={`${item.label} (${item.unit})`}>
                  <Input
                    type="number"
                    step="any"
                    value={macros[item.key]}
                    onChange={(e) => setMacros((curr) => ({ ...curr, [item.key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </Section>

          {groups.map(({ group, label, items }) => (
            <Section key={group} title={label} description="Optional. Leave blank when unknown." tone="muted">
              <div className="ui-grid">
                {items.map((item) => (
                  <Field key={item.key} label={`${item.label} (${item.unit})`}>
                    <Input
                      type="number"
                      step="any"
                      value={extras[item.key]}
                      onChange={(e) => setExtras((prev) => ({ ...prev, [item.key]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
            </Section>
          ))}

          <div className="ui-row">
            <Button type="submit" disabled={saveBusy}>
              {saveBusy ? "Saving…" : "Save custom food"}
            </Button>
            <Button type="button" variant="danger" onClick={() => void archiveCustom()}>
              Archive custom food
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Section
            title="Nutrition"
            description={
              isCustom
                ? "Clinic-private custom food. Staff can view values but cannot edit."
                : "Catalog values are read-only. Duplicate the food to your clinic to edit a copy."
            }
          >
            <Table>
              <thead>
                <tr>
                  <th>Nutrient</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {NUTRIENTS.map((item) => (
                  <tr key={item.key}>
                    <Td label="Nutrient">
                      {item.label}{" "}
                      <span className="ui-muted" style={{ fontSize: 12 }}>
                        ({item.unit})
                      </span>
                    </Td>
                    <Td label="Value">
                      <strong>{fmtVal(food.presentedEffectiveNutrition[item.key])}</strong>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div style={{ marginTop: 12 }}>
              <ExtraNutrientTables
                values={presentedExtras}
                caption={`per ${food.referenceQuantity} ${unitLabel(food.referenceUnit)}`}
                emptyMessage="No vitamin, mineral, or lipid extras on file for this food."
                showAll
              />
            </div>
          </Section>
        </>
      )}

      <Section
        title="Quantity calculator"
        description="Calculate nutrition for any amount using this food’s values (g/ml via the nutrition package)."
      >
        <form onSubmit={(event) => void calculate(event)} className="ui-inline-form">
          <Field label="Quantity">
            <Input
              value={quantity}
              type="number"
              min="0.001"
              step="any"
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Unit">
            <Select value={unit} onChange={(event) => setUnit(event.target.value)}>
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="ui-inline-form__action">
            <Button type="submit">Calculate</Button>
          </div>
        </form>
        {food.servingDescription ? (
          <p className="ui-muted" style={{ marginTop: 8, fontSize: 13 }}>
            Serving: {food.servingDescription}
          </p>
        ) : null}

        {calculated ? (
          <div className="ui-stack" style={{ marginTop: 16, gap: 16 }}>
            <div className="ui-row" style={{ flexWrap: "wrap" }}>
              <div className="ui-stat">
                <div className="ui-stat__label">Calories</div>
                <div className="ui-stat__value">{fmtVal(calculated.presented.energyKcal)} kcal</div>
              </div>
              {NUTRIENTS.filter((n) => n.key !== "energyKcal").map((item) =>
                calculated.presented[item.key] !== null ? (
                  <div className="ui-stat" key={item.key}>
                    <div className="ui-stat__label">{item.label}</div>
                    <div className="ui-stat__value">
                      {fmtVal(calculated.presented[item.key])}
                      {item.unit}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
            {calculated.presentedExtraNutrients ? (
              <ExtraNutrientTables values={calculated.presentedExtraNutrients} caption="for this amount" showAll />
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Data source">
        <p style={{ marginBottom: 4 }}>
          <strong>{food.source.name}</strong>
          {food.source.datasetVersion ? (
            <span className="ui-muted"> · {food.source.datasetVersion}</span>
          ) : null}
        </p>
        {food.source.attribution ? (
          <p className="ui-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            {food.source.attribution}
          </p>
        ) : null}
        {food.source.license ? (
          <p className="ui-muted" style={{ fontSize: 13 }}>
            License: {food.source.license}
          </p>
        ) : null}
      </Section>
    </section>
  );
}
