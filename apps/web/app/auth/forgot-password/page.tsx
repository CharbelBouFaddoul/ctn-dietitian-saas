"use client";

import { FormEvent, useState } from "react";
import { api } from "../../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "../auth-shell";

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
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <AuthShell title="Forgot password">
      <form onSubmit={(event) => void onSubmit(event)}>
        <label style={fieldStyle}>
          Email
          <input
            style={inputStyle}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Send reset link
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </AuthShell>
  );
}
