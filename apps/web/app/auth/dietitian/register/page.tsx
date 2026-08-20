"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input, PasswordInput, LoadingState } from "@nutrition-saas/ui";
import { API_URL, api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { AuthShell } from "../../auth-shell";

export default function DietitianRegisterPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) {
          setEnabled(false);
          return;
        }
        const data = (await res.json()) as { registrationEnabled?: boolean };
        setEnabled(data.registrationEnabled === true);
      })
      .catch(() => setEnabled(false));
  }, []);

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

  if (enabled === null) {
    return (
      <AuthShell title="Create your practice account" audience="dietitian" description="Checking registration availability…">
        <LoadingState>Loading…</LoadingState>
      </AuthShell>
    );
  }

  if (!enabled) {
    return (
      <AuthShell
        title="Registration is closed"
        audience="dietitian"
        description="Self-serve practice registration is currently disabled. Sign in if you already have an account, or contact the platform administrator."
      >
        <Link href="/auth/dietitian/login" className="ui-btn ui-btn--primary ui-btn--block">
          Sign in as Dietitian
        </Link>
        <p style={{ marginTop: 16 }}>
          <Link href="/contact" className="ui-link">
            Contact us
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your practice account"
      audience="dietitian"
      description="Start your nutrition SaaS workspace for client care, meal plans, tracking, messaging, and practice operations. We’ll send a verification email — then you can sign in and open your practice."
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
          Create practice account
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
