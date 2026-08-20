"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input, PasswordInput } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { AuthShell } from "../../auth-shell";

export default function ClientRegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      const result = await api<{ message: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          consents: [
            { type: "TERMS_OF_SERVICE", policyVersion: "1.0" },
            { type: "PRIVACY_POLICY", policyVersion: "1.0" },
          ],
        }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    }
  }

  return (
    <AuthShell
      title="Create your patient account"
      audience="client"
      description="Create your patient account, then enter the join code provided by your dietitian. After you verify your email and sign in, you’ll connect to their practice. The name you enter here is what they will see on their client list."
    >
      <form onSubmit={(event) => void onSubmit(event)}>
        <Field label="First name">
          <Input autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </Field>
        <Field label="Last name">
          <Input autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />
        </Field>
        <Field label="Confirm password">
          <PasswordInput
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={10}
            required
          />
        </Field>
        <Button type="submit" block>
          Create account
        </Button>
      </form>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">
            {message}{" "}
            <Link href="/auth/verify-email?audience=client" className="ui-link">
              Verify email
            </Link>
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
    </AuthShell>
  );
}
