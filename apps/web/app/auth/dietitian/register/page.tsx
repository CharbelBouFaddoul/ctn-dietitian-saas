"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput, LoadingState } from "@nutrition-saas/ui";
import { API_URL, api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { resolveSessionHome } from "../../../../lib/session-home";
import { AuthShell } from "../../auth-shell";

export default function DietitianRegisterPage() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void resolveSessionHome("dietitian").then((home) => {
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
      }
    });
  }, [router]);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) {
          setEnabled(false);
          return;
        }
        const data = (await res.json()) as {
          dietitianRegistrationEnabled?: boolean;
          registrationEnabled?: boolean;
        };
        setEnabled(
          data.dietitianRegistrationEnabled === true ||
            (data.dietitianRegistrationEnabled === undefined && data.registrationEnabled === true),
        );
      })
      .catch(() => setEnabled(false));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          audience: "dietitian",
          consents: [
            { type: "TERMS_OF_SERVICE", policyVersion: "1.0" },
            { type: "PRIVACY_POLICY", policyVersion: "1.0" },
          ],
        }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    }
  }

  if (enabled === null) {
    return (
      <AuthShell title="Create your clinic account" audience="dietitian" description="Checking registration availability…">
        <LoadingState>Loading…</LoadingState>
      </AuthShell>
    );
  }

  if (!enabled) {
    return (
      <AuthShell
        title="Registration is closed"
        audience="dietitian"
        description="Self-serve clinic registration is currently disabled. View plans and contact us to get set up, or sign in if you already have an account."
      >
        <Link href="/plans" className="ui-btn ui-btn--primary ui-btn--block">
          View plans
        </Link>
        <p style={{ marginTop: 16 }}>
          <Link href="/auth/dietitian/login" className="ui-link">
            Sign in as Dietitian
          </Link>
          {" · "}
          <Link href="/contact" className="ui-link">
            Contact us
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your clinic account"
      audience="dietitian"
      description="Start your nutrition SaaS workspace for client care, meal plans, tracking, messaging, and clinic operations. We’ll send a verification email — then you can sign in and open your clinic."
    >
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
        <Field label="Password" hint="At least 10 characters.">
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />
        </Field>
        <Button type="submit" block>
          Create clinic account
        </Button>
      </form>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">
            {message}{" "}
            <Link href="/auth/verify-email" className="ui-link">
              Verify email
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
