"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, LoadingState } from "@nutrition-saas/ui";
import { ApiError, api } from "../../lib/api";
import { errorMessage } from "../../lib/humanize-error";
import { loginPathFor, resolveSessionHome } from "../../lib/session-home";

interface DietitianAccount {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** Phase 3: no multi-practice picker — land on the sole/first account. */
export default function PracticeIndexPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const home = await resolveSessionHome("dietitian");
        if (cancelled) return;
        if (home.kind === "unauthenticated") {
          router.replace(loginPathFor("dietitian"));
          return;
        }
        if (home.kind !== "dietitian") {
          router.replace(home.path);
          return;
        }
        if (home.path.startsWith("/practice/")) {
          router.replace(home.path);
          return;
        }
        const accounts = await api<DietitianAccount[]>("/api/v1/dietitian");
        if (cancelled) return;
        const first = accounts[0];
        if (first) {
          router.replace(`/practice/${first.id}`);
          return;
        }
        setError("No clinic account is available. Contact an administrator.");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(loginPathFor("dietitian"));
          return;
        }
        setError(errorMessage(err, "Unable to load clinic"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <Alert tone="danger">{error}</Alert>
      </main>
    );
  }

  return <LoadingState>Opening your clinic…</LoadingState>;
}
