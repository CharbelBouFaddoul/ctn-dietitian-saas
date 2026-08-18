"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "../auth-shell";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  }

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
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label style={fieldStyle}>
          Verification token
          <input
            style={inputStyle}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Verify email
        </button>
      </form>
      <form onSubmit={(event) => void onResend(event)} style={{ marginTop: 24 }}>
        <label style={fieldStyle}>
          Resend to email
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Resend verification
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Verify email">
      <Suspense fallback={<p>Loading…</p>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
