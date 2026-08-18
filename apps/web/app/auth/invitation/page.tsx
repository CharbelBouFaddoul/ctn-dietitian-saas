"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "../auth-shell";

function InvitationForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<{ email?: string; clientName?: string | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void api<{ email?: string; clientName?: string | null }>("/api/v1/auth/invitations/preview", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      {preview?.clientName ? <p>Invitation for {preview.clientName}</p> : null}
      {preview?.email ? <p>Email {preview.email}</p> : null}
      <label style={fieldStyle}>
        Token
        <input style={inputStyle} value={token} onChange={(event) => setToken(event.target.value)} required />
      </label>
      <label style={fieldStyle}>
        Choose a password
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
        Activate portal account
      </button>
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </form>
  );
}

export default function InvitationPage() {
  return (
    <AuthShell title="Client portal invitation">
      <Suspense fallback={<p>Loading…</p>}>
        <InvitationForm />
      </Suspense>
    </AuthShell>
  );
}
