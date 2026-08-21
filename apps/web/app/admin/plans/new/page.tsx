"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  PageHeader,
  Section,
} from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

export default function AdminCreatePlanPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const plan = await api<{ id: string }>("/api/v1/admin/plans", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      router.push(`/admin/plans/${plan.id}`);
    } catch (err) {
      setError(errorMessage(err, "Unable to create plan"));
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        eyebrow="Commerce"
        title="Create plan"
        description="Add a new subscription plan. You can configure features after creation."
        actions={
          <Link href="/admin/plans" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to plans
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Section title="Plan details">
        <form onSubmit={(event) => void onCreate(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Plan name" required />
          </Field>
          <Field label="Slug">
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="slug" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create plan"}
          </Button>
        </form>
      </Section>
    </section>
  );
}
