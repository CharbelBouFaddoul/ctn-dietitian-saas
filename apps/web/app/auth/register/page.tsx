"use client";

import { FormEvent, useState } from "react";
import { api } from "../../../lib/api";
import { AuthShell, buttonStyle, fieldStyle, inputStyle } from "../auth-shell";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <AuthShell title="Register">
      <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
        Creates an authentication identity only. Check the API console for the verification link.
      </p>
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Create account
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
    </AuthShell>
  );
}
