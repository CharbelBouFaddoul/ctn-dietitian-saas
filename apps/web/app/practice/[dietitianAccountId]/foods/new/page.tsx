"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Breadcrumbs, Button, Field, Input, PageHeader, Section, Select } from "@nutrition-saas/ui";
import { MICRONUTRIENT_DEFS, type MicronutrientKey } from "../../../../../lib/micronutrients";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  return Number(t);
}

export default function NewCustomFoodPage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [servingDescription, setServingDescription] = useState("100 g");
  const [referenceQuantity, setReferenceQuantity] = useState("100");
  const [referenceUnit, setReferenceUnit] = useState("g");
  const [energyKcal, setEnergyKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbohydrateG, setCarbohydrateG] = useState("");
  const [fatG, setFatG] = useState("");
  const [fiberG, setFiberG] = useState("");
  const [sugarG, setSugarG] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [extras, setExtras] = useState<Record<MicronutrientKey, string>>(() => {
    const init = {} as Record<MicronutrientKey, string>;
    for (const def of MICRONUTRIENT_DEFS) init[def.key] = "";
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(
    () =>
      (["lipids", "minerals", "vitamins"] as const).map((group) => ({
        group,
        label: group === "lipids" ? "Lipids" : group === "minerals" ? "Minerals" : "Vitamins",
        items: MICRONUTRIENT_DEFS.filter((d) => d.group === group),
      })),
    [],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const extraNutrients: Record<string, number | null> = {};
      for (const def of MICRONUTRIENT_DEFS) {
        const v = numOrNull(extras[def.key]);
        if (v !== null) extraNutrients[def.key] = v;
      }
      const created = await api<{ id: string }>(`/api/v1/dietitian/${dietitianAccountId}/foods`, {
        method: "POST",
        body: JSON.stringify({
          name,
          category: category || undefined,
          servingDescription: servingDescription || undefined,
          referenceQuantity: Number(referenceQuantity),
          referenceUnit,
          energyKcal: numOrNull(energyKcal),
          proteinG: numOrNull(proteinG),
          carbohydrateG: numOrNull(carbohydrateG),
          fatG: numOrNull(fatG),
          fiberG: numOrNull(fiberG),
          sugarG: numOrNull(sugarG),
          sodiumMg: numOrNull(sodiumMg),
          extraNutrients: Object.keys(extraNutrients).length > 0 ? extraNutrients : undefined,
        }),
      });
      router.push(`/practice/${dietitianAccountId}/foods?food=${created.id}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create custom food"));
      setBusy(false);
    }
  }

  return (
    <section className="ui-stack" style={{ gap: 20, width: "100%" }}>
      <Breadcrumbs
        items={[
          { label: "Foods", href: `/practice/${dietitianAccountId}/foods` },
          { label: "New custom food" },
        ]}
      />
      <PageHeader
        title="New custom food"
        description="Practice-private food with full nutrition facts. Never added to the global catalog."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="ui-stack" onSubmit={(e) => void onSubmit(e)} style={{ width: "100%", gap: 20 }}>
        <Section title="Basics">
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
            <Field label="Calories (kcal)">
              <Input type="number" step="any" value={energyKcal} onChange={(e) => setEnergyKcal(e.target.value)} />
            </Field>
            <Field label="Protein (g)">
              <Input type="number" step="any" value={proteinG} onChange={(e) => setProteinG(e.target.value)} />
            </Field>
            <Field label="Carbs (g)">
              <Input
                type="number"
                step="any"
                value={carbohydrateG}
                onChange={(e) => setCarbohydrateG(e.target.value)}
              />
            </Field>
            <Field label="Fat (g)">
              <Input type="number" step="any" value={fatG} onChange={(e) => setFatG(e.target.value)} />
            </Field>
            <Field label="Fiber (g)">
              <Input type="number" step="any" value={fiberG} onChange={(e) => setFiberG(e.target.value)} />
            </Field>
            <Field label="Sugar (g)">
              <Input type="number" step="any" value={sugarG} onChange={(e) => setSugarG(e.target.value)} />
            </Field>
            <Field label="Sodium (mg)">
              <Input type="number" step="any" value={sodiumMg} onChange={(e) => setSodiumMg(e.target.value)} />
            </Field>
          </div>
        </Section>

        {groups.map(({ group, label, items }) => (
          <Section
            key={group}
            title={label}
            description="Optional. Leave blank when unknown."
            tone="muted"
          >
            <div className="ui-grid">
              {items.map((item) => (
                <Field key={item.key} label={`${item.label} (${item.unit})`}>
                  <Input
                    type="number"
                    step="any"
                    value={extras[item.key]}
                    onChange={(e) =>
                      setExtras((prev) => ({
                        ...prev,
                        [item.key]: e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          </Section>
        ))}

        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create custom food"}
        </Button>
      </form>
    </section>
  );
}
