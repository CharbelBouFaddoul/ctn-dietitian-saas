"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Breadcrumbs, Button, Field, Input, PageHeader, Select } from "@nutrition-saas/ui";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/v1/dietitian/${dietitianAccountId}/foods`, {
        method: "POST",
        body: JSON.stringify({
          name,
          category: category || undefined,
          servingDescription: servingDescription || undefined,
          referenceQuantity: Number(referenceQuantity),
          referenceUnit,
          energyKcal: energyKcal === "" ? null : Number(energyKcal),
          proteinG: proteinG === "" ? null : Number(proteinG),
          carbohydrateG: carbohydrateG === "" ? null : Number(carbohydrateG),
          fatG: fatG === "" ? null : Number(fatG),
          fiberG: fiberG === "" ? null : Number(fiberG),
        }),
      });
      router.push(`/practice/${dietitianAccountId}/foods/${created.id}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create custom food"));
      setBusy(false);
    }
  }

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: "Foods", href: `/practice/${dietitianAccountId}/foods` },
          { label: "New custom food" },
        ]}
      />
      <PageHeader
        title="New custom food"
        description="Practice-private food. Never added to the global catalog."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="ui-stack" onSubmit={(e) => void onSubmit(e)} style={{ maxWidth: 520 }}>
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
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create custom food"}
        </Button>
      </form>
    </section>
  );
}
