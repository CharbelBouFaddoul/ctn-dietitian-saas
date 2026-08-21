"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@nutrition-saas/ui";
import { resolveSessionHome } from "./session-home";

/**
 * Guest-only gate for marketing pages.
 * Authenticated users are redirected to their resolved dashboard/home.
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveSessionHome().then((home) => {
      if (cancelled) return;
      if (home.kind !== "unauthenticated") {
        router.replace(home.path);
        return;
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return <LoadingState>Loading…</LoadingState>;
  }

  return <>{children}</>;
}
