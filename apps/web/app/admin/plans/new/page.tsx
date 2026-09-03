"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Section,
} from "@nutrition-saas/ui";
import { AdminPage } from "../../_components/admin-page";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

export default function AdminCreatePlanPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [showPrice, setShowPrice] = useState(false);
  const [listedPublicly, setListedPublicly] = useState(true);
  const [durationDays, setDurationDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const priceCents =
        price.trim() === "" ? null : Math.round(Number(price) * 100);
      if (price.trim() !== "" && Number.isNaN(priceCents)) {
        throw new Error("Enter a valid price");
      }
      const plan = await api<{ id: string }>("/api/v1/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug,
          description: description.trim() || undefined,
          priceCents,
          currency: currency.trim() || "USD",
          showPrice,
          listedPublicly,
          durationDays: Number(durationDays) || 30,
        }),
      });
      router.push(`/admin/plans/${plan.id}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create plan"));
      setBusy(false);
    }
  }

  return (
    <AdminPage
      eyebrow="Product"
      title="Create plan"
      description="Add a new subscription plan. Configure entitlements after creation."
      error={error}
      crumbs={[
        { href: "/admin/plans", label: "Plans" },
        { label: "Create plan" },
      ]}
      actions={
        <Link href="/admin/plans" className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to plans
        </Link>
      }
    >
      <Section title="Plan details">
        <form onSubmit={(event) => void onCreate(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Plan name" required />
          </Field>
          <Field label="Slug">
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="slug" required />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
            />
          </Field>
          <Field label="Price">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="e.g. 49.00"
            />
          </Field>
          <Field label="Currency">
            <Input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="USD" />
          </Field>
          <Field label="Duration (days)">
            <Input
              type="number"
              min={1}
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              required
            />
          </Field>
          <label className="ui-row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} />
            <span>Show price on public Plans page</span>
          </label>
          <label className="ui-row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={listedPublicly} onChange={(event) => setListedPublicly(event.target.checked)} />
            <span>List on public Plans page</span>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create plan"}
          </Button>
        </form>
      </Section>
    </AdminPage>
  );
}
