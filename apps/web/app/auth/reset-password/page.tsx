"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Field, PasswordInput } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { AuthShell } from "../auth-shell";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tokenFromLink = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: tokenFromLink, password }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(errorMessage(err, "Reset failed"));
    }
  }

  if (!tokenFromLink) {
    return (
      <Alert tone="warning">
        This reset link is missing. Open the link from your email, or{" "}
        <Link href="/auth/forgot-password" className="ui-link">
          request a new one
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <Field label="New password" hint="At least 10 characters.">
        <PasswordInput
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={10}
          required
        />
      </Field>
      <Button type="submit" block>
        Reset password
      </Button>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">
            {message}{" "}
            <Link href="/auth/login" className="ui-link">
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
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Reset password" audience="dietitian">
      <Suspense fallback={<p className="ui-muted">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
