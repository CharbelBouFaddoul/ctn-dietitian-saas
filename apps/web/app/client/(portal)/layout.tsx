"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";
import { NotificationBell } from "../../../lib/use-notifications";
import { PatientNavIcons } from "./patient-nav-icons";

interface PortalMe {
  client: { id: string; firstName: string; lastName: string; displayName: string | null };
  practiceName?: string | null;
  activeClientId?: string;
}

interface PortalConnection {
  clientId: string;
  practiceName: string;
  dietitianAccountId: string | null;
}

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok">("loading");
  const [me, setMe] = useState<PortalMe | null>(null);
  const [connections, setConnections] = useState<PortalConnection[]>([]);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const [profile, links] = await Promise.all([
      api<PortalMe>("/api/v1/portal/me"),
      api<PortalConnection[]>("/api/v1/portal/connections").catch(() => [] as PortalConnection[]),
    ]);
    setMe(profile);
    setConnections(links);
    setState("ok");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
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
  }, [router, load]);

  async function onLogout() {
    await logout();
    router.replace(loginPathFor("client"));
  }

  async function onSwitch(clientId: string) {
    if (clientId === me?.client.id) return;
    setSwitching(true);
    try {
      await api("/api/v1/portal/connections/active", {
        method: "POST",
        body: JSON.stringify({ clientId }),
      });
      await load();
      window.dispatchEvent(new CustomEvent("portal-connection-changed"));
      router.refresh();
    } catch {
      /* keep current */
    } finally {
      setSwitching(false);
    }
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
        { href: "/client/assessments", label: "Assessments", icon: PatientNavIcons.assessments },
      ],
    },
    {
      label: "Communication",
      items: [
        { href: "/client/messages", label: "Messages", icon: PatientNavIcons.messages },
        { href: "/client/appointments", label: "Appointments", icon: PatientNavIcons.appointments },
        { href: "/client/notifications", label: "Notifications", icon: PatientNavIcons.notifications },
      ],
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
      items: [
        { href: "/client/profile", label: "Profile", icon: PatientNavIcons.profile },
        { href: "/client/join", label: "Join another practice", icon: PatientNavIcons.profile },
      ],
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
        <div style={{ display: "grid", gap: 8 }}>
          <NotificationBell
            key={me?.client.id ?? "portal"}
            mode={{ kind: "portal" }}
            enabled={state === "ok"}
            placement="above"
          />
          {connections.length > 1 ? (
            <label className="ui-field" style={{ margin: 0 }}>
              <span style={{ fontSize: 12 }}>Active practice</span>
              <select
                className="ui-input"
                value={me?.client.id ?? ""}
                disabled={switching}
                onChange={(event) => void onSwitch(event.target.value)}
              >
                {connections.map((row) => (
                  <option key={row.clientId} value={row.clientId}>
                    {row.practiceName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
      }
      topbarActions={
        <NotificationBell
          key={`top-${me?.client.id ?? "portal"}`}
          mode={{ kind: "portal" }}
          enabled={state === "ok"}
          placement="below"
        />
      }
    >
      <div key={me?.client.id ?? "portal"}>{children}</div>
    </AppShell>
  );
}
