"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Alert, AppShell, Button, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { useMessagingRealtime } from "../../../lib/realtime";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";
import { NotificationBell } from "../../../lib/use-notifications";
import { PracticeNavIcons } from "./practice-nav-icons";

interface PracticeDetail {
  id: string;
  name: string;
  status: string;
  context?: {
    dietitianAccountId: string;
    displayName: string;
    accountStatus: string;
  };
}

interface SubscriptionAccess {
  accessState: "ACTIVE" | "GRACE" | "READ_ONLY" | "LOCKED";
  status: string | null;
  planSlug: string | null;
  planName: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  readOnlyEndsAt: string | null;
  daysRemainingInPhase: number | null;
}

interface PracticeContextValue {
  dietitianAccountId: string;
  name: string;
  role: string;
  subscriptionAccess: SubscriptionAccess | null;
  /** False when AI entitlement or runtime (AI_ENABLED) is off. */
  aiAvailable: boolean;
}

const PracticeContext = createContext<PracticeContextValue | null>(null);

export function usePractice(): PracticeContextValue {
  const value = useContext(PracticeContext);
  if (!value) {
    throw new Error("usePractice must be used inside PracticeShell");
  }
  return value;
}

function roleLabel(role: string): string {
  if (role === "OWNER") return "Owner";
  if (role === "DIETITIAN") return "Dietitian";
  if (role === "STAFF") return "Staff";
  return "Team member";
}

export function PracticeShell({ children }: { children: ReactNode }) {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const pathname = usePathname();
  const router = useRouter();
  const [practice, setPractice] = useState<PracticeDetail | null>(null);
  const [access, setAccess] = useState<SubscriptionAccess | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "locked" | "unauth" | "forbidden">("loading");
  const [unreadMessages, setUnreadMessages] = useState(0);

  const refreshUnreadMessages = useCallback(async () => {
    const rows = await api<{ unreadCount: number }[]>(
      `/api/v1/dietitian/${dietitianAccountId}/conversations`,
    );
    setUnreadMessages(rows.reduce((sum, row) => sum + (row.unreadCount || 0), 0));
  }, [dietitianAccountId]);

  useMessagingRealtime(state === "ok", {
    onUnreadUpdated: () => {
      void refreshUnreadMessages().catch(() => undefined);
    },
    onMessageCreated: () => {
      void refreshUnreadMessages().catch(() => undefined);
    },
    onConversationUpdated: () => {
      void refreshUnreadMessages().catch(() => undefined);
    },
    onReconnect: () => {
      void refreshUnreadMessages().catch(() => undefined);
    },
  });

  useEffect(() => {
    if (state !== "ok") return;
    void refreshUnreadMessages().catch(() => undefined);
  }, [state, refreshUnreadMessages, pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const accessData = await api<SubscriptionAccess>(
          `/api/v1/dietitian/${dietitianAccountId}/subscription-access`,
        );
        if (cancelled) return;
        setAccess(accessData);
        if (accessData.accessState === "LOCKED") {
          setPractice({
            id: dietitianAccountId,
            name: accessData.planName ? `${accessData.planName} clinic` : "Clinic",
            status: "ACTIVE",
          });
          setState("locked");
          return;
        }
        const practiceData = await api<PracticeDetail>(`/api/v1/dietitian/${dietitianAccountId}`);
        if (cancelled) return;
        setPractice(practiceData);
        try {
          const aiUsage = await api<{ available?: boolean; enabled?: boolean; providerConfigured?: boolean }>(
            `/api/v1/dietitian/${dietitianAccountId}/ai/usage`,
          );
          if (!cancelled) {
            setAiAvailable(
              aiUsage.available === true ||
                (aiUsage.enabled === true && aiUsage.providerConfigured !== false),
            );
          }
        } catch {
          if (!cancelled) setAiAvailable(false);
        }
        setState("ok");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setState("unauth");
          return;
        }
        if (
          error instanceof ApiError &&
          error.status === 403 &&
          typeof error.message === "string" &&
          error.message.toLowerCase().includes("locked")
        ) {
          setState("locked");
          setPractice({
            id: dietitianAccountId,
            name: "Clinic",
            status: "ACTIVE",
          });
          return;
        }
        setState("forbidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId]);

  useEffect(() => {
    if (state === "unauth") {
      router.replace(loginPathFor("dietitian"));
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
    router.replace(loginPathFor("dietitian"));
  }

  if (state === "loading" || !practice) {
    return <LoadingState>Loading clinic…</LoadingState>;
  }

  if (state === "locked") {
    return (
      <main style={{ padding: 32, maxWidth: 560, margin: "0 auto" }}>
        <Alert tone="danger">
          This clinic is locked because the subscription has expired
          {access?.planName ? ` (${access.planName})` : ""}. Contact a platform administrator to renew
          access. Your data is preserved.
        </Alert>
        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={() => void onLogout()}>
            Sign out
          </Button>
          <Link href="/contact" className="ui-btn ui-btn--primary">
            Contact support
          </Link>
        </div>
      </main>
    );
  }

  // Single-owner practices: owner is the only practice role.
  const role = "OWNER";
  const base = `/practice/${dietitianAccountId}`;
  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [{ href: base, label: "Dashboard", icon: PracticeNavIcons.dashboard, exact: true }],
    },
    {
      label: "Patients",
      items: [
        { href: `${base}/clients`, label: "Clients", icon: PracticeNavIcons.clients },
        { href: `${base}/messages`, label: "Messages", icon: PracticeNavIcons.messages, badge: unreadMessages },
      ],
    },
    {
      label: "Nutrition",
      items: [
        { href: `${base}/meal-plans`, label: "Meal Plans", icon: PracticeNavIcons.mealPlans },
        { href: `${base}/recipes`, label: "Meal library", icon: PracticeNavIcons.recipes },
        { href: `${base}/foods`, label: "Foods", icon: PracticeNavIcons.foods },
        { href: `${base}/habits`, label: "Habit library", icon: PracticeNavIcons.tasks },
      ],
    },
    {
      label: "Clinic",
      items: [
        { href: `${base}/calendar`, label: "Calendar", icon: PracticeNavIcons.calendar },
        { href: `${base}/tasks`, label: "Tasks", icon: PracticeNavIcons.tasks },
        { href: `${base}/invoices`, label: "Invoices", icon: PracticeNavIcons.invoices },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: `${base}/analytics`, label: "Analytics", icon: PracticeNavIcons.analytics },
        ...(aiAvailable ? [{ href: `${base}/ai`, label: "AI", icon: PracticeNavIcons.ai }] : []),
        { href: `${base}/automations`, label: "Automations", icon: PracticeNavIcons.automations },
      ],
    },
    {
      label: "System",
      items: [{ href: `${base}/settings`, label: "Settings", icon: PracticeNavIcons.settings }],
    },
  ];

  const banner =
    access?.accessState === "GRACE" ? (
      <Alert tone="warning">
        Subscription expired
        {access.daysRemainingInPhase != null
          ? ` — ${access.daysRemainingInPhase} day${access.daysRemainingInPhase === 1 ? "" : "s"} left in grace`
          : ""}
        . Contact an administrator to renew. Clinic remains fully usable during grace.
      </Alert>
    ) : access?.accessState === "READ_ONLY" ? (
      <Alert tone="warning">
        Clinic is read-only
        {access.daysRemainingInPhase != null
          ? ` — ${access.daysRemainingInPhase} day${access.daysRemainingInPhase === 1 ? "" : "s"} remaining`
          : ""}
        . You can view data but cannot make changes until the subscription is renewed.
      </Alert>
    ) : null;

  return (
    <PracticeContext.Provider
      value={{
        dietitianAccountId,
        name: practice.name,
        role,
        subscriptionAccess: access,
        aiAvailable,
      }}
    >
      <AppShell
        theme="practice"
        brand={practice.name}
        meta={roleLabel(role)}
        navSections={navSections}
        pathname={pathname}
        linkComponent={Link}
        collapsible
        footer={
          <div className="ui-stack">
            <NotificationBell
              mode={{ kind: "practice", dietitianAccountId }}
              enabled={state === "ok"}
              placement="above"
            />
            <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
              Sign out
            </Button>
          </div>
        }
        topbarActions={
          <NotificationBell
            mode={{ kind: "practice", dietitianAccountId }}
            enabled={state === "ok"}
            placement="below"
          />
        }
      >
        {banner ? <div style={{ marginBottom: 16 }}>{banner}</div> : null}
        {children}
      </AppShell>
    </PracticeContext.Provider>
  );
}
