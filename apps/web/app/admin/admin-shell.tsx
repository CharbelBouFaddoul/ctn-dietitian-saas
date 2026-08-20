"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../lib/session-home";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/food-sources", label: "Food database" },
  { href: "/admin/features", label: "Features" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/health", label: "System health" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok" | "unauth" | "forbidden">("loading");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void api<{ user: { platformRole: string } }>("/api/v1/admin/me")
      .then((data) => {
        setRole(data.user.platformRole);
        setState("ok");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          setState("unauth");
          return;
        }
        setState("forbidden");
      });
  }, []);

  useEffect(() => {
    if (state === "unauth") {
      router.replace(loginPathFor("admin"));
      return;
    }
    if (state === "forbidden") {
      void resolveSessionHome().then((home) => {
        router.replace(home.kind === "unauthenticated" ? loginPathFor("dietitian") : home.path);
      });
    }
  }, [state, router]);

  async function onLogout() {
    await logout();
    router.replace(loginPathFor("admin"));
  }

  if (state !== "ok") {
    return <LoadingState>Checking platform access…</LoadingState>;
  }

  return (
    <AppShell
      theme="admin"
      brand="Nutrition"
      meta={role === "SUPER_ADMIN" ? "Super admin" : "Admin"}
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
