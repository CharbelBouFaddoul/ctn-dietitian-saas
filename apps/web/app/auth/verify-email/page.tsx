"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input } from "@nutrition-saas/ui";
import { api } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { AuthShell } from "../auth-shell";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const tokenFromLink = searchParams.get("token") ?? "";
  const audience = searchParams.get("audience") === "client" ? "client" : "dietitian";
  const signInHref = audience === "client" ? "/auth/client/login" : "/auth/dietitian/login";
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  async function verify(value: string) {
    const result = await api<{ message: string }>("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: value }),
    });
    setMessage(result.message);
  }

  useEffect(() => {
    if (!tokenFromLink || autoTried) return;
    setAutoTried(true);
    void verify(tokenFromLink).catch((err) => setError(errorMessage(err, "Verification failed")));
  }, [tokenFromLink, autoTried]);

  async function onResend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/resend-verification", {
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
      title="Verify email"
      audience={audience}
      description="Open the link from your email, or resend a new one."
    >
      {tokenFromLink && !message && !error ? <p>Verifying your email…</p> : null}
      {tokenFromLink && error ? (
        <Button
          onClick={() => {
            setError(null);
            void verify(tokenFromLink).catch((err) => setError(errorMessage(err, "Verification failed")));
          }}
        >
          Try again
        </Button>
      ) : null}
      {!tokenFromLink ? (
        <Alert tone="warning">Open the verification link from your email to finish setting up your account.</Alert>
      ) : null}
      <form onSubmit={(event) => void onResend(event)} style={{ marginTop: 24 }}>
        <Field label="Resend to email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Button type="submit" variant="secondary" block>
          Resend verification
        </Button>
      </form>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">
            {message}{" "}
            <Link href={signInHref} className="ui-link">
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="ui-muted">Loading…</p>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
