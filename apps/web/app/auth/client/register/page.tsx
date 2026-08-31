"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, PasswordInput, LoadingState } from "@nutrition-saas/ui";
import { API_URL, api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { resolveSessionHome } from "../../../../lib/session-home";
import { AuthShell } from "../../auth-shell";
import { LegalConsentCheckbox } from "../../../../components/legal-consent-checkbox";
import { LEGAL_POLICY_VERSION } from "../../../../lib/marketing/legal";

export default function ClientRegisterPage() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void resolveSessionHome("client").then((home) => {
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
          patientRegistrationEnabled?: boolean;
          registrationEnabled?: boolean;
        };
        setEnabled(
          data.patientRegistrationEnabled === true ||
            (data.patientRegistrationEnabled === undefined && data.registrationEnabled === true),
        );
      })
      .catch(() => setEnabled(false));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the Terms of use and Privacy policy.");
      return;
    }
    try {
      const result = await api<{ message: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          audience: "patient",
          consents: [
            { type: "TERMS_OF_SERVICE", policyVersion: LEGAL_POLICY_VERSION },
            { type: "PRIVACY_POLICY", policyVersion: LEGAL_POLICY_VERSION },
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
      <AuthShell title="Create your patient account" audience="client" description="Checking registration availability…">
        <LoadingState>Loading…</LoadingState>
      </AuthShell>
    );
  }

  if (!enabled) {
    return (
      <AuthShell
        title="Registration is closed"
        audience="client"
        description="Self-serve patient registration is currently disabled. Sign in if you already have an account, then join with your dietitian’s code."
      >
        <Link href="/auth/client/login" className="ui-btn ui-btn--primary ui-btn--block">
          Sign in as Patient
        </Link>
        <p style={{ marginTop: 16 }}>
          Already signed in?{" "}
          <Link href="/client/join" className="ui-link">
            Enter a join code
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your patient account"
      audience="client"
      description="Create your patient account, then enter the join code provided by your dietitian. After you verify your email and sign in, you’ll connect to their practice. The name you enter here is what they will see on their client list."
    >
      <form onSubmit={(event) => void onSubmit(event)}>
        <Field label="First name">
          <Input autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </Field>
        <Field label="Last name">
          <Input autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
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
        <Field label="Confirm password">
          <PasswordInput
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={10}
            required
          />
        </Field>
        <LegalConsentCheckbox checked={agreed} onChange={setAgreed} />
        <Button type="submit" block>
          Create account
        </Button>
      </form>
      {message ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">
            {message}{" "}
            <Link href="/auth/verify-email?audience=client" className="ui-link">
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
