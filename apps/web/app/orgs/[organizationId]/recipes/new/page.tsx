"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";

export default function NewRecipePage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/v1/organizations/${params.organizationId}/recipes`, {
        method: "POST",
        body: JSON.stringify({ name, servings: Number(servings), description: description || null }),
      });
      router.push(`/orgs/${params.organizationId}/recipes/${created.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create recipe"));
      setBusy(false);
    }
  }

  return (
    <section>
      <Breadcrumbs
        items={[
          { href: `/orgs/${params.organizationId}/recipes`, label: "Recipes" },
          { label: "New recipe" },
        ]}
      />

      <PageHeader
        title="New recipe"
        description="Nutrition is calculated automatically from your food database when you add ingredients."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form
        onSubmit={(event) => void onSubmit(event)}
        style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}
      >
        <Field label="Recipe name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="e.g. Greek salad"
          />
        </Field>
        <Field label="Servings" hint="Used to calculate per-serving nutrition.">
          <Input
            value={servings}
            type="number"
            min="1"
            step="1"
            onChange={(event) => setServings(event.target.value)}
          />
        </Field>
        <Field label="Description" hint="Optional. Visible to clients in their portal.">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Brief description of this recipe…"
          />
        </Field>
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create recipe"}
          </Button>
        </div>
      </form>
    </section>
  );
}
