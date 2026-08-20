"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Breadcrumbs,
  Button,
  Field,
  Input,
  PageHeader,
  Section,
  Textarea,
} from "@nutrition-saas/ui";
import { api } from "../../../../../lib/api";
import { errorMessage } from "../../../../../lib/humanize-error";

export default function NewRecipePage() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/v1/dietitian/${dietitianAccountId}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          name,
          servings: Number(servings),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
        }),
      });
      router.push(`/practice/${dietitianAccountId}/recipes/${created.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create reusable meal"));
      setBusy(false);
    }
  }

  return (
    <section className="ui-stack" style={{ gap: 20 }}>
      <Breadcrumbs
        items={[
          { href: `/practice/${dietitianAccountId}/recipes`, label: "Meal library" },
          { label: "New meal" },
        ]}
      />

      <PageHeader
        title="New reusable meal"
        description="Set the basics now. Next you’ll add foods — nutrition totals update automatically."
        actions={
          <Link href={`/practice/${dietitianAccountId}/recipes`} className="ui-btn ui-btn--secondary">
            Back to library
          </Link>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Meal details">
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="ui-stack"
          style={{ gap: 16, width: "100%" }}
        >
          <Field label="Name" hint="Shown in the meal library and when adding to a plan.">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="e.g. Greek yogurt bowl"
              autoFocus
            />
          </Field>

          <div className="ui-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <Field label="Servings" hint="Per-serving nutrition = total ÷ servings.">
              <Input
                value={servings}
                type="number"
                min="1"
                step="1"
                onChange={(event) => setServings(event.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Description" hint="Optional short summary for you and clients.">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. High-protein breakfast with berries and honey…"
              rows={3}
            />
          </Field>

          <Field label="Instructions" hint="Optional prep steps. You can edit these anytime.">
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="1. …&#10;2. …"
              rows={5}
            />
          </Field>

          <div className="ui-row" style={{ gap: 10, marginTop: 8 }}>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create & add ingredients"}
            </Button>
            <Link href={`/practice/${dietitianAccountId}/recipes`} className="ui-btn ui-btn--secondary">
              Cancel
            </Link>
          </div>
        </form>
      </Section>
    </section>
  );
}
