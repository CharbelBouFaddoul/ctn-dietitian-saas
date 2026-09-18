"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput, Section } from "@nutrition-saas/ui";
import { AdminPage } from "../../_components/admin-page";
import { adminPath } from "../../../../lib/admin-path";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

export default function AdminCreateAdminPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      router.push(adminPath(`/site-settings/admins/${created.id}`));
    } catch (err) {
      setError(errorMessage(err, "Unable to create admin"));
      setBusy(false);
    }
  }

  return (
    <AdminPage
      eyebrow="People"
      title="Add admin"
      description="Creates a platform console login. This account does not need a clinic."
      crumbs={[
        { href: adminPath("/admins"), label: "Admins" },
        { label: "Add admin" },
      ]}
      actions={
        <Link href={adminPath("/admins")} className="ui-btn ui-btn--secondary ui-btn--sm">
          Back to admins
        </Link>
      }
    >
      <Section title="Admin account">
        <form onSubmit={(event) => void onSubmit(event)} className="ui-stack" style={{ maxWidth: 480 }}>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="First name">
            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Password" hint="At least 10 characters, with a letter and a number.">
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Button type="submit" disabled={busy || !email.trim() || password.length < 10}>
            {busy ? "Creating…" : "Create admin"}
          </Button>
        </form>
      </Section>
    </AdminPage>
  );
}
