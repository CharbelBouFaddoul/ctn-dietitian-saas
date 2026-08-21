"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, ErrorState, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../lib/session-home";
import { AdminNavIcons } from "./admin-nav-icons";

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok" | "unauth" | "forbidden" | "unreachable">("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api<{ user: { platformRole: string } }>("/api/v1/admin/me")
      .then(() => {
        if (cancelled) return;
        setState("ok");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setState("unauth");
          return;
        }
        if (!(error instanceof ApiError) || error.status === 0) {
          setState("unreachable");
          return;
        }
        setState("forbidden");
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  useEffect(() => {
    if (state === "unauth") {
      router.replace(loginPathFor("admin"));
      return;
    }
    if (state === "forbidden") {
      void resolveSessionHome()
        .then((home) => {
          router.replace(home.kind === "unauthenticated" ? loginPathFor("dietitian") : home.path);
        })
        .catch(() => {
          router.replace(loginPathFor("admin"));
        });
    }
  }, [state, router]);

  async function onLogout() {
    await logout();
    router.replace(loginPathFor("admin"));
  }

  if (state === "unreachable") {
    return (
      <ErrorState
        title="API unreachable"
        action={
          <Button onClick={() => setRetryKey((value) => value + 1)}>
            Retry
          </Button>
        }
      >
        Unable to reach the API. If Docker just restarted, wait a few seconds and try again.
      </ErrorState>
    );
  }

  if (state !== "ok") {
    return <LoadingState>Checking platform access…</LoadingState>;
  }

  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [{ href: "/admin", label: "Dashboard", icon: AdminNavIcons.dashboard, exact: true }],
    },
    {
      label: "Platform",
      items: [
        { href: "/admin/dietitians", label: "Dietitians", icon: AdminNavIcons.dietitians },
        { href: "/admin/users", label: "Users", icon: AdminNavIcons.users },
      ],
    },
    {
      label: "Commerce",
      items: [
        { href: "/admin/subscriptions", label: "Subscriptions", icon: AdminNavIcons.subscriptions },
        { href: "/admin/plans", label: "Plans", icon: AdminNavIcons.plans },
      ],
    },
    {
      label: "Catalog",
      items: [
        { href: "/admin/food-sources", label: "Food database", icon: AdminNavIcons.foods },
        { href: "/admin/features", label: "Features", icon: AdminNavIcons.features },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "/admin/audit", label: "Audit", icon: AdminNavIcons.audit },
        { href: "/admin/health", label: "System health", icon: AdminNavIcons.health },
      ],
    },
    {
      label: "Configuration",
      items: [{ href: "/admin/site-settings", label: "Site", icon: AdminNavIcons.site }],
    },
  ];

  return (
    <AppShell
      theme="admin"
      brand="Nutrition"
      meta="Admin"
      navSections={navSections}
      pathname={pathname}
      linkComponent={Link}
      collapsible
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
