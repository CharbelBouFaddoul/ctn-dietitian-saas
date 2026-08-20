"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";

const nav = [
  { href: "/client", label: "Home" },
  { href: "/client/plan", label: "My Plan" },
  { href: "/client/tracking", label: "Tracking" },
  { href: "/client/progress", label: "Progress" },
  { href: "/client/messages", label: "Messages" },
  { href: "/client/documents", label: "Documents" },
  { href: "/client/invoices", label: "Invoices" },
  { href: "/client/profile", label: "Profile" },
];

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api("/api/v1/portal/me");
        if (!cancelled) setState("ok");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace(loginPathFor("client"));
          return;
        }
        const home = await resolveSessionHome();
        if (home.kind === "unauthenticated") {
          router.replace(loginPathFor("client"));
          return;
        }
        router.replace(home.path);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onLogout() {
    await logout();
    router.replace(loginPathFor("client"));
  }

  if (state !== "ok") {
    return <LoadingState>Checking portal access…</LoadingState>;
  }

  return (
    <AppShell
      theme="client"
      variant="client"
      brand="My portal"
      nav={nav}
      pathname={pathname}
      linkComponent={Link}
      footer={
        <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
          Sign out
        </Button>
      }
    >
      {children}
    </AppShell>
  );
}
