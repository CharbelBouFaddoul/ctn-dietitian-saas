"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { AuthShell } from "../auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(errorMessage(err, "Request failed"));
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      audience="dietitian"
      description="We’ll send a reset link if an account exists for that email."
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
        <Button type="submit" block>
          Send reset link
        </Button>
      </form>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">{message}</Alert>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <p style={{ marginTop: 16, fontSize: 13 }}>
        <Link href="/auth/dietitian/login" className="ui-link">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
