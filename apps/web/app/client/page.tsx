"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

interface PortalMe {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    status: string;
  };
}

export default function ClientHomePage() {
  const [data, setData] = useState<PortalMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<PortalMe>("/api/v1/portal/me")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Portal is not available"));
  }, []);

  return (
    <section>
      <h1>Today</h1>
      <p style={{ color: "var(--color-muted)" }}>Your published meal plan is on the Plan tab. Log food, water, exercise, sleep, and habits on Track.</p>
      {data ? (
        <p>Signed in as {data.client.displayName ?? `${data.client.firstName} ${data.client.lastName}`}</p>
      ) : null}
      {error ? (
        <p>
          {error}. <Link href="/auth">Sign in</Link>
        </p>
      ) : null}
      <p>
        <Link href="/client/plan" style={{ color: "var(--color-accent)" }}>
          Open meal plan
        </Link>{" "}
        ·{" "}
        <Link href="/client/tracking" style={{ color: "var(--color-accent)" }}>
          Open tracking
        </Link>
      </p>
    </section>
  );
}
