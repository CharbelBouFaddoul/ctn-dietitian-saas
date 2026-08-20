"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, PasswordInput } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { AuthShell } from "../auth-shell";

export default function InvitationPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("token") ?? "";
    if (fromQuery) {
      setToken(fromQuery);
      setHasToken(true);
    }
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(errorMessage(err, "Unable to accept invitation"));
    }
  }

  if (hasToken || token) {
    return (
      <AuthShell
        title="Activate your practice"
        audience="dietitian"
        description="Set a password to activate the dietitian account provisioned by an administrator."
      >
        <form onSubmit={(event) => void onSubmit(event)}>
          {!hasToken ? (
            <Field label="Invitation token">
              <input
                className="ui-input"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
            </Field>
          ) : null}
          <Field label="Password" hint="At least 10 characters, with a letter and a number.">
            <PasswordInput
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              required
            />
          </Field>
          <Button type="submit" block>
            Activate account
          </Button>
        </form>
        {message ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="success">
              {message}{" "}
              <Link href="/auth/dietitian/login" className="ui-link">
                Sign in
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

  return (
    <AuthShell
      title="Join with a code"
      audience="client"
      description="Create a client account, verify your email, and sign in. Then enter the join code your dietitian sends you."
    >
      <Link href="/auth/client/register" className="ui-btn ui-btn--primary ui-btn--block">
        Create a client account
      </Link>
      <p style={{ marginTop: 16 }}>
        Already registered?{" "}
        <Link href="/auth/client/login" className="ui-link">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
