"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "./auth-shell";

interface MeResponse {
  user: { email: string; status: string };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  async function refreshMe() {
    try {
      const current = await api<MeResponse>("/api/v1/auth/me");
      setMe(current);
    } catch {
      setMe(null);
    }
  }

  useEffect(() => {
    void refreshMe();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setMessage(result.message);
      await refreshMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function onLogout() {
    setError(null);
    await api("/api/v1/auth/logout", { method: "POST" });
    setMe(null);
    setMessage("Signed out");
  }

  return (
    <AuthShell title="Sign in">
      {me ? (
        <p>
          Signed in as <strong>{me.user.email}</strong> ({me.user.status}).
          <a href="/orgs" style={{ display: "block", marginTop: 12, color: "var(--color-accent)" }}>
            Organizations
          </a>
          <a href="/client" style={{ display: "block", marginTop: 8, color: "var(--color-accent)" }}>
            Client portal
          </a>
          <button type="button" onClick={() => void onLogout()} style={{ ...buttonStyle, marginTop: 16 }}>
            Sign out
          </button>
        </p>
      ) : (
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
          <label style={fieldStyle}>
            Password
            <input
              style={inputStyle}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" style={buttonStyle}>
            Sign in
          </button>
        </form>
      )}
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </AuthShell>
  );
}
