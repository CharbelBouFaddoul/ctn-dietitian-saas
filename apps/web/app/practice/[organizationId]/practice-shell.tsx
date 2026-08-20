"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState, type NavSection } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";
import { PracticeNavIcons } from "./practice-nav-icons";

interface OrgDetail {
  id: string;
  name: string;
  role: string;
  status: string;
  context?: { membershipId: string; role: string };
}

interface PracticeContextValue {
  organizationId: string;
  name: string;
  role: string;
  membershipId: string;
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
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const pathname = usePathname();
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "unauth" | "forbidden">("loading");

  useEffect(() => {
    void api<OrgDetail>(`/api/v1/organizations/${organizationId}`)
      .then((data) => {
        setOrg(data);
        setState("ok");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          setState("unauth");
          return;
        }
        setState("forbidden");
      });
  }, [organizationId]);

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

  if (state !== "ok" || !org) {
    return <LoadingState>Loading practice…</LoadingState>;
  }

  const membershipId = org.context?.membershipId ?? "";
  const base = `/practice/${organizationId}`;
  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [{ href: base, label: "Dashboard", icon: PracticeNavIcons.dashboard, exact: true }],
    },
    {
      label: "Patients",
      items: [
        { href: `${base}/clients`, label: "Clients", icon: PracticeNavIcons.clients },
        { href: `${base}/calendar`, label: "Calendar", icon: PracticeNavIcons.calendar },
        { href: `${base}/messages`, label: "Messages", icon: PracticeNavIcons.messages },
      ],
    },
    {
      label: "Nutrition",
      items: [
        { href: `${base}/meal-plans`, label: "Meal Plans", icon: PracticeNavIcons.mealPlans },
        { href: `${base}/recipes`, label: "Recipes", icon: PracticeNavIcons.recipes },
        { href: `${base}/foods`, label: "Foods", icon: PracticeNavIcons.foods },
      ],
    },
    {
      label: "Practice",
      items: [
        { href: `${base}/tasks`, label: "Tasks", icon: PracticeNavIcons.tasks },
        { href: `${base}/documents`, label: "Documents", icon: PracticeNavIcons.documents },
        { href: `${base}/invoices`, label: "Invoices", icon: PracticeNavIcons.invoices },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: `${base}/analytics`, label: "Analytics", icon: PracticeNavIcons.analytics },
        { href: `${base}/ai`, label: "AI", icon: PracticeNavIcons.ai },
        { href: `${base}/automations`, label: "Automations", icon: PracticeNavIcons.automations },
      ],
    },
    {
      label: "System",
      items: [{ href: `${base}/settings`, label: "Settings", icon: PracticeNavIcons.settings }],
    },
  ];

  return (
    <PracticeContext.Provider value={{ organizationId, name: org.name, role: org.role, membershipId }}>
      <AppShell
        theme="practice"
        brand={org.name}
        meta={roleLabel(org.role)}
        navSections={navSections}
        pathname={pathname}
        linkComponent={Link}
        collapsible
        footer={
          <div className="ui-stack">
            <Link href="/practice" className="ui-nav-link">
              All organizations
            </Link>
            <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
              Sign out
            </Button>
          </div>
        }
      >
        {children}
      </AppShell>
    </PracticeContext.Provider>
  );
}
