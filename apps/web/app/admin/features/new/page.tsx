"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Section, Select } from "@nutrition-saas/ui";
import { AdminPage } from "../../_components/admin-page";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

export default function AdminCreateFeaturePage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [valueType, setValueType] = useState<"BOOLEAN" | "LIMIT">("BOOLEAN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/admin/features", {
        method: "POST",
        body: JSON.stringify({ key, name, valueType }),
      });
      router.push("/admin/features");
    } catch (err) {
      setError(errorMessage(err, "Unable to create entitlement"));
      setBusy(false);
    }
  }

  return (
    <AdminPage
      eyebrow="Product"
      title="Add entitlement"
      description="Define a global catalog key used by subscription plans."
      error={error}
      crumbs={[
        { href: "/admin/features", label: "Entitlements" },
        { label: "Add entitlement" },
      ]}
      actions={
        <Link href="/admin/features" className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to entitlements
        </Link>
      }
    >
      <Section title="Entitlement details">
        <form onSubmit={(event) => void onCreate(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          <Field label="Key">
            <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="FEATURE_KEY" required />
          </Field>
          <Field label="Display name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required />
          </Field>
          <Field label="Type">
            <Select value={valueType} onChange={(event) => setValueType(event.target.value as "BOOLEAN" | "LIMIT")}>
              <option value="BOOLEAN">On / off</option>
              <option value="LIMIT">Limit</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create entitlement"}
          </Button>
        </form>
      </Section>
    </AdminPage>
  );
}
