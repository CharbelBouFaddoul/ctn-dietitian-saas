"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../lib/session-home";
import { AdminNavIcons } from "./admin-nav-icons";

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

  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [{ href: "/admin", label: "Dashboard", icon: AdminNavIcons.dashboard, exact: true }],
    },
    {
      label: "Platform",
      items: [
        { href: "/admin/dietitians", label: "Organizations", icon: AdminNavIcons.organizations },
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
      meta={role === "SUPER_ADMIN" ? "Super admin" : "Admin"}
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
