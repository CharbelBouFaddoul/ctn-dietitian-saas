"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, LoadingState } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { errorMessage } from "../../../lib/humanize-error";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";

interface Onboarding {
  status: "needs_join" | "connected";
  practiceName?: string | null;
}

export default function ClientJoinPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const onboarding = await api<Onboarding>("/api/v1/portal/onboarding");
        if (cancelled) return;
        if (onboarding.status === "connected") {
          router.replace("/client");
          return;
        }
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await api<Onboarding>("/api/v1/portal/join", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setSuccess(`You're now connected to ${result.practiceName ?? "your practice"}.`);
      setTimeout(() => router.replace("/client"), 800);
    } catch (err) {
      setError(errorMessage(err, "That code didn't work."));
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
    <main className="ui-auth">
      <section className="ui-card ui-auth__card">
        <div className="ui-row" style={{ justifyContent: "space-between" }}>
          <p className="ui-eyebrow">Client portal</p>
          <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
        <h1 style={{ margin: "0.35rem 0 0.75rem", fontSize: "1.75rem" }}>Join your dietitian</h1>
        <p className="ui-muted">
          Enter the short practice code they sent you, like K7XM-42QP. We’ll add you to their list using the name and
          email from your account.
        </p>
        <form onSubmit={(event) => void onSubmit(event)}>
          <Field label="Join code">
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
            {pending ? "Connecting…" : "Connect"}
          </Button>
        </form>
        {success ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="success">{success}</Alert>
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
      </section>
    </main>
  );
}
