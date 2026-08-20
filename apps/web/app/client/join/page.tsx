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
      setSuccess(`You’re now connected to ${result.practiceName ?? "your dietitian"}.`);
      setTimeout(() => router.replace("/client"), 900);
    } catch (err) {
      setError(errorMessage(err, "That code didn’t work. Check with your dietitian and try again."));
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
          <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
        <h1>Join your dietitian</h1>
        <p className="ui-muted">
          Enter the short practice code they shared with you. We’ll connect your account using the name and email you
          already registered with.
        </p>
        <form onSubmit={(event) => void onSubmit(event)}>
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
            {pending ? "Joining…" : "Join practice"}
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
