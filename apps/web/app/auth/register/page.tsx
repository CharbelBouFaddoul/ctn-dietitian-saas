"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input, PasswordInput } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { AuthShell } from "../auth-shell";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
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
      title="Run your nutrition practice with confidence."
      audience="dietitian"
      description="Create your dietitian account. We’ll send a verification email — then you can sign in and open your practice."
    >
      <form onSubmit={(event) => void onSubmit(event)}>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
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
        <Button type="submit" block>
          Create account
        </Button>
      </form>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">
            {message}{" "}
            <Link href="/auth/verify-email" className="ui-link">
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
