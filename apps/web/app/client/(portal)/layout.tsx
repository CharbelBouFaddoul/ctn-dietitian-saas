"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { useMessagingRealtime } from "../../../lib/realtime";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";
import { NotificationBell } from "../../../lib/use-notifications";
import { PatientNavIcons } from "./patient-nav-icons";

interface PortalMe {
  client: { id: string; firstName: string; lastName: string; displayName: string | null };
  practiceName?: string | null;
  dietitianDisplayName?: string | null;
  activeClientId?: string;
  portalPresets?: { messaging: boolean; tracking: boolean; mealPlans: boolean };
}

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok">("loading");
  const [me, setMe] = useState<PortalMe | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const refreshUnreadMessages = useCallback(async () => {
    const conversation = await api<{ unreadCount: number }>("/api/v1/portal/conversation");
    setUnreadMessages(conversation.unreadCount || 0);
  }, []);

  useMessagingRealtime(state === "ok", {
    onUnreadUpdated: (event) => {
      if (pathname?.startsWith("/client/messages")) {
        setUnreadMessages(0);
        return;
      }
      if (typeof event.unreadCount === "number") {
        setUnreadMessages(event.unreadCount);
        return;
      }
      void refreshUnreadMessages().catch(() => undefined);
    },
    onMessageCreated: () => {
      if (pathname?.startsWith("/client/messages")) {
        setUnreadMessages(0);
        return;
      }
      void refreshUnreadMessages().catch(() => undefined);
    },
    onReconnect: () => {
      void refreshUnreadMessages().catch(() => undefined);
    },
  });

  useEffect(() => {
    if (state !== "ok") return;
    if (pathname?.startsWith("/client/messages")) {
      setUnreadMessages(0);
      return;
    }
    void refreshUnreadMessages().catch(() => undefined);
  }, [state, refreshUnreadMessages, pathname, me?.client.id]);

  useEffect(() => {
    function onMessagesRead() {
      setUnreadMessages(0);
      void refreshUnreadMessages().catch(() => undefined);
    }
    window.addEventListener("portal-messages-read", onMessagesRead);
    return () => window.removeEventListener("portal-messages-read", onMessagesRead);
  }, [refreshUnreadMessages]);

  const load = useCallback(async () => {
    const profile = await api<PortalMe>("/api/v1/portal/me");
    setMe(profile);
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
        // Soft-revoke / no ACTIVE connection: session stays valid but /portal/me is 403.
        // Never redirect back to /client here — that would loop with this layout.
        const home = await resolveSessionHome("client");
        if (home.kind === "unauthenticated") {
          router.replace(loginPathFor("client"));
          return;
        }
        router.replace(home.path === "/client" ? "/client/join" : home.path);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load]);

  useEffect(() => {
    function onConnectionChanged() {
      void load().catch(() => undefined);
    }
    window.addEventListener("portal-connection-changed", onConnectionChanged);
    return () => window.removeEventListener("portal-connection-changed", onConnectionChanged);
  }, [load]);

  const presets = me?.portalPresets ?? { messaging: true, tracking: true, mealPlans: true };

  useEffect(() => {
    if (state !== "ok" || !pathname) return;
    if (!presets.mealPlans && pathname.startsWith("/client/plan")) {
      router.replace("/client");
      return;
    }
    if (!presets.tracking && (pathname.startsWith("/client/tracking") || pathname.startsWith("/client/progress"))) {
      router.replace("/client");
      return;
    }
    if (!presets.messaging && pathname.startsWith("/client/messages")) {
      router.replace("/client");
    }
  }, [state, pathname, presets.mealPlans, presets.messaging, presets.tracking, router]);

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
        ...(presets.mealPlans ? [{ href: "/client/plan", label: "My Plan", icon: PatientNavIcons.plan }] : []),
        ...(presets.tracking
          ? [
              { href: "/client/tracking", label: "Daily log", icon: PatientNavIcons.tracking },
              { href: "/client/progress", label: "Progress", icon: PatientNavIcons.progress },
            ]
          : []),
        { href: "/client/assessments", label: "Forms", icon: PatientNavIcons.assessments },
      ],
    },
    {
      label: "Communication",
      items: [
        ...(presets.messaging
          ? [{ href: "/client/messages", label: "Messages", icon: PatientNavIcons.messages, badge: unreadMessages }]
          : []),
        { href: "/client/appointments", label: "Appointments", icon: PatientNavIcons.appointments },
      ],
    },
    {
      label: "Documents & billing",
      items: [
        { href: "/client/documents", label: "Documents", icon: PatientNavIcons.documents },
        { href: "/client/invoices", label: "Billing", icon: PatientNavIcons.invoices },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/client/profile", label: "Profile", icon: PatientNavIcons.profile },
        { href: "/client/join", label: "Join another clinic", icon: PatientNavIcons.profile },
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
        <div className="ui-portal-sidebar-foot">
          <NotificationBell
            key={me?.client.id ?? "portal"}
            mode={{ kind: "portal" }}
            enabled={state === "ok"}
            placement="above"
          />
          <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
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
