"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";
import { PatientNavIcons } from "./patient-nav-icons";

interface PortalMe {
  client: { firstName: string; lastName: string; displayName: string | null };
  practiceName?: string | null;
}

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok">("loading");
  const [me, setMe] = useState<PortalMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await api<PortalMe>("/api/v1/portal/me");
        if (!cancelled) {
          setMe(profile);
          setState("ok");
        }
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

  const displayName =
    me?.client.displayName?.trim() ||
    `${me?.client.firstName ?? ""} ${me?.client.lastName ?? ""}`.trim() ||
    "Patient";
  const brand = me?.practiceName?.trim() || "My portal";

  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [{ href: "/client", label: "Home", icon: PatientNavIcons.home, exact: true }],
    },
    {
      label: "My nutrition",
      items: [
        { href: "/client/plan", label: "My Plan", icon: PatientNavIcons.plan },
        { href: "/client/tracking", label: "Tracking", icon: PatientNavIcons.tracking },
        { href: "/client/progress", label: "Progress", icon: PatientNavIcons.progress },
      ],
    },
    {
      label: "Communication",
      items: [{ href: "/client/messages", label: "Messages", icon: PatientNavIcons.messages }],
    },
    {
      label: "Documents & billing",
      items: [
        { href: "/client/documents", label: "Documents", icon: PatientNavIcons.documents },
        { href: "/client/invoices", label: "Invoices", icon: PatientNavIcons.invoices },
      ],
    },
    {
      label: "Account",
      items: [{ href: "/client/profile", label: "Profile", icon: PatientNavIcons.profile }],
    },
  ];

  return (
    <AppShell
      theme="client"
      brand={brand}
      meta={displayName}
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
