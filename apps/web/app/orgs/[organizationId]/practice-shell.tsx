"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppShell, Button, LoadingState } from "@nutrition-saas/ui";
import { ApiError, api, logout } from "../../../lib/api";
import { loginPathFor, resolveSessionHome } from "../../../lib/session-home";

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
  const nav = [
    { href: `/orgs/${organizationId}`, label: "Dashboard" },
    { href: `/orgs/${organizationId}/clients`, label: "Clients" },
    { href: `/orgs/${organizationId}/calendar`, label: "Calendar" },
    { href: `/orgs/${organizationId}/meal-plans`, label: "Meal plans" },
    { href: `/orgs/${organizationId}/recipes`, label: "Recipes" },
    { href: `/orgs/${organizationId}/foods`, label: "Foods" },
    { href: `/orgs/${organizationId}/messages`, label: "Messages" },
    { href: `/orgs/${organizationId}/documents`, label: "Documents" },
    { href: `/orgs/${organizationId}/invoices`, label: "Invoices" },
    { href: `/orgs/${organizationId}/tasks`, label: "Tasks" },
    { href: `/orgs/${organizationId}/analytics`, label: "Analytics" },
    { href: `/orgs/${organizationId}/ai`, label: "AI" },
    { href: `/orgs/${organizationId}/automations`, label: "Automations" },
    { href: `/orgs/${organizationId}/settings`, label: "Settings" },
  ];

  return (
    <PracticeContext.Provider value={{ organizationId, name: org.name, role: org.role, membershipId }}>
      <AppShell
        theme="practice"
        brand={org.name}
        meta={org.role === "OWNER" ? "Owner" : org.role === "DIETITIAN" ? "Dietitian" : "Staff"}
        nav={nav}
        pathname={pathname}
        linkComponent={Link}
        footer={
          <div className="ui-stack">
            <Link href="/orgs" className="ui-nav-link">
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
