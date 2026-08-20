"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput } from "@nutrition-saas/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/humanize-error";
import { resolveSessionHome } from "../../lib/session-home";
import { AuthShell, type AuthAudience } from "./auth-shell";

export function SignInForm({
  audience,
  title,
  description,
}: {
  audience: AuthAudience;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const home = await resolveSessionHome(
        audience === "client" ? "client" : audience === "admin" ? "admin" : "dietitian",
      );
      router.replace(home.path);
    } catch (err) {
      setError(errorMessage(err, "Sign in failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title={title} audience={audience} description={description}>
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
        <Field label="Password">
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" block disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
    </AuthShell>
  );
}
