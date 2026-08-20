"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, LoadingState } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";

interface ResolveResult {
  status: "ok" | "already_connected";
  practiceName: string | null;
  dietitianDisplayName: string | null;
  clientId: string | null;
}

interface JoinResult {
  status: "joined" | "already_connected";
  practiceName?: string | null;
  dietitianDisplayName?: string | null;
  clientId?: string | null;
}

type Step = "enter" | "confirm" | "already" | "done";

export default function ClientJoinPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasConnections, setHasConnections] = useState(false);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ResolveResult | null>(null);
  const [step, setStep] = useState<Step>("enter");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const onboarding = await api<{ status: string }>("/api/v1/portal/onboarding");
        if (cancelled) return;
        setHasConnections(onboarding.status === "connected");
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(loginPathFor("client"));
          return;
        }
        const home = await resolveSessionHome();
        router.replace(home.kind === "unauthenticated" ? loginPathFor("client") : home.path);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onResolve(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await api<ResolveResult>("/api/v1/portal/join-code/resolve", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setPreview(result);
      setStep(result.status === "already_connected" ? "already" : "confirm");
    } catch (err) {
      setPreview(null);
      setStep("enter");
      setError(errorMessage(err, "That code didn’t work. Check with your dietitian and try again."));
    } finally {
      setPending(false);
    }
  }

  async function onConfirm() {
    setError(null);
    setPending(true);
    try {
      const result = await api<JoinResult>("/api/v1/portal/join", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (result.status === "already_connected") {
        setPreview({
          status: "already_connected",
          practiceName: result.practiceName ?? null,
          dietitianDisplayName: result.dietitianDisplayName ?? null,
          clientId: result.clientId ?? null,
        });
        setStep("already");
        return;
      }
      setSuccess(`You’re now connected to ${result.practiceName ?? "your dietitian"}.`);
      setStep("done");
      setTimeout(() => router.replace("/client"), 900);
    } catch (err) {
      setError(errorMessage(err, "Unable to join this practice."));
    } finally {
      setPending(false);
    }
  }

  async function onLogout() {
    await logout();
    router.replace(loginPathFor("client"));
  }

  if (!ready) {
    return <LoadingState>Checking your account…</LoadingState>;
  }

  return (
    <main className="ui-client-join" data-theme="client">
      <section className="ui-client-join__card">
        <div className="ui-row" style={{ justifyContent: "space-between" }}>
          <p className="ui-eyebrow">Patient portal</p>
          <div className="ui-row" style={{ gap: 8 }}>
            {hasConnections ? (
              <Link href="/client" className="ui-btn ui-btn--ghost ui-btn--sm">
                Back to portal
              </Link>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
              Sign out
            </Button>
          </div>
        </div>
        <h1>Join a dietitian</h1>
        <p className="ui-muted">
          Enter the practice code they shared. You’ll confirm the practice before connecting.
        </p>

        {step === "enter" ? (
          <form onSubmit={(event) => void onResolve(event)}>
            <Field label="Practice code">
              <Input
                className="ui-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                autoComplete="one-time-code"
                placeholder="K7XM-42QP"
                required
              />
            </Field>
            <Button type="submit" block disabled={pending}>
              {pending ? "Checking…" : "Continue"}
            </Button>
          </form>
        ) : null}

        {step === "confirm" && preview ? (
          <div className="ui-stack" style={{ gap: 12 }}>
            <Alert tone="neutral">
              <strong>Dietitian:</strong> {preview.dietitianDisplayName ?? "—"}
              <br />
              <strong>Practice:</strong> {preview.practiceName ?? "—"}
            </Alert>
            <Button block disabled={pending} onClick={() => void onConfirm()}>
              {pending ? "Joining…" : "Join"}
            </Button>
            <Button
              variant="secondary"
              block
              disabled={pending}
              onClick={() => {
                setStep("enter");
                setPreview(null);
                setError(null);
              }}
            >
              Use a different code
            </Button>
          </div>
        ) : null}

        {step === "already" && preview ? (
          <div className="ui-stack" style={{ gap: 12 }}>
            <Alert tone="success">
              You’re already connected to {preview.practiceName ?? "this practice"}
              {preview.dietitianDisplayName ? ` (${preview.dietitianDisplayName})` : ""}. Use the
              connection switcher in the portal to select it.
            </Alert>
            <Link href="/client" className="ui-btn ui-btn--primary" style={{ textAlign: "center" }}>
              Go to portal
            </Link>
            <Button
              variant="secondary"
              block
              onClick={() => {
                setStep("enter");
                setPreview(null);
                setCode("");
                setError(null);
              }}
            >
              Join another practice
            </Button>
          </div>
        ) : null}

        {step === "done" && success ? <Alert tone="success">{success}</Alert> : null}

        {error ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
      </section>
    </main>
  );
}
