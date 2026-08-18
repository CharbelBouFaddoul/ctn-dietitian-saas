"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "../auth-shell";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <label style={fieldStyle}>
        Token
        <input
          style={inputStyle}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
        />
      </label>
      <label style={fieldStyle}>
        New password
        <input
          style={inputStyle}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={10}
          required
        />
      </label>
      <button type="submit" style={buttonStyle}>
        Reset password
      </button>
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Reset password">
      <Suspense fallback={<p>Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
