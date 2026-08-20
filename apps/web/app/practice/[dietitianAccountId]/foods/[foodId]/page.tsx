"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
import { type ExtraNutrients } from "../../../../../lib/micronutrients";
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
  overriddenFields: NutrientKey[];
  override: { id: string; status: string } | null;
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

export default function FoodDetailPage() {
  const params = useParams<{ dietitianAccountId: string; foodId: string }>();
  const { dietitianAccountId, foodId } = params;
  const practice = usePractice();
  const [food, setFood] = useState<EffectiveFood | null>(null);
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
  const [saveBusy, setSaveBusy] = useState(false);

  const canOverride = practice.role === "OWNER" || practice.role === "DIETITIAN";

  async function load() {
    setError(null);
    const detail = await api<EffectiveFood>(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}`);
    setFood(detail);
    setQuantity(String(detail.referenceQuantity));
    setUnit(detail.referenceUnit);
    const next = { ...draft };
    for (const item of NUTRIENTS) {
      const overridden = detail.overriddenFields.includes(item.key);
      next[item.key] = overridden ? String(detail.effectiveNutrition[item.key] ?? "") : "";
    }
    setDraft(next);
  }

  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err, "Unable to load food")));
  }, [dietitianAccountId, foodId]);

  async function saveOverride(event: FormEvent) {
    event.preventDefault();
    setSaveBusy(true);
    setError(null);
    setNotice(null);
    try {
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
      await api(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}/override`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setNotice("Practice override saved. The global food record was not changed.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not save override"));
    } finally {
      setSaveBusy(false);
    }
  }

  async function resetOverride() {
    setError(null);
    setNotice(null);
    try {
      await api(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}/override`, {
        method: "DELETE",
      });
      setNotice("Override removed. Effective values are now sourced from the global catalog.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not remove override"));
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
          isCustom ? (
            <Badge tone="accent">Custom</Badge>
          ) : food.override ? (
            <Badge tone="warning">Overridden</Badge>
          ) : (
            <Badge tone="neutral">Catalog</Badge>
          )
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Section
        title="Macros"
        description={
          isCustom
            ? "Practice-private custom food. Nutrients live on the food row (no FoodOverride merge)."
            : canOverride
              ? "Practice overrides replace catalog macros for this food in recipes and meal plans in your practice."
              : "Effective values are sourced from the catalog. Staff cannot create overrides."
        }
      >
        {isCustom ? (
          <div className="ui-stack">
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
              />
            </div>

            {canOverride ? (
              <Button
                variant="danger"
                onClick={() => {
                  void api(`/api/v1/dietitian/${dietitianAccountId}/foods/${foodId}/archive`, {
                    method: "POST",
                  })
                    .then(() => {
                      setNotice("Custom food archived.");
                    })
                    .catch((err) => setError(errorMessage(err, "Unable to archive")));
                }}
              >
                Archive custom food
              </Button>
            ) : null}
          </div>
        ) : (
          <form onSubmit={(event) => void saveOverride(event)}>
            <Table>
              <thead>
                <tr>
                  <th>Nutrient</th>
                  <th>Effective</th>
                  <th>Global catalog</th>
                  <th>Origin</th>
                  {canOverride ? <th>Override value</th> : null}
                </tr>
              </thead>
              <tbody>
                {NUTRIENTS.map((item) => {
                  const isOverridden = food.overriddenFields.includes(item.key);
                  return (
                    <tr key={item.key}>
                      <Td label="Nutrient">
                        {item.label}{" "}
                        <span className="ui-muted" style={{ fontSize: 12 }}>
                          ({item.unit})
                        </span>
                      </Td>
                      <Td label="Effective">
                        <strong>{fmtVal(food.presentedEffectiveNutrition[item.key])}</strong>
                      </Td>
                      <Td label="Global catalog">{fmtVal(food.globalNutrition[item.key])}</Td>
                      <Td label="Origin">
                        {isOverridden ? (
                          <Badge tone="accent">Practice</Badge>
                        ) : (
                          <Badge tone="neutral">Catalog</Badge>
                        )}
                      </Td>
                      {canOverride ? (
                        <Td label="Override value">
                          <input
                            className="ui-input"
                            style={{ width: 100 }}
                            value={draft[item.key]}
                            placeholder={
                              isOverridden ? String(food.effectiveNutrition[item.key] ?? "") : "global"
                            }
                            onChange={(event) =>
                              setDraft((curr) => ({ ...curr, [item.key]: event.target.value }))
                            }
                          />
                        </Td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            <div style={{ marginTop: 12 }}>
              <ExtraNutrientTables
                values={presentedExtras}
                caption={`per ${food.referenceQuantity} ${unitLabel(food.referenceUnit)}`}
                emptyMessage="No vitamin, mineral, or lipid extras on file for this food."
              />
            </div>

            {canOverride ? (
              <div className="ui-row" style={{ marginTop: 12 }}>
                <Button type="submit" disabled={saveBusy}>
                  {saveBusy ? "Saving…" : "Save practice override"}
                </Button>
                {food.override ? (
                  <Button type="button" variant="danger" onClick={() => void resetOverride()}>
                    Remove override
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="ui-muted" style={{ marginTop: 8, fontSize: 13 }}>
                Staff members can view effective nutrition but cannot create overrides.
              </p>
            )}
          </form>
        )}
      </Section>

      <Section
        title="Quantity calculator"
        description="Calculate nutrition for any amount using effective values (g/ml via the nutrition package)."
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
              <ExtraNutrientTables
                values={calculated.presentedExtraNutrients}
                caption="for this amount"
              />
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
