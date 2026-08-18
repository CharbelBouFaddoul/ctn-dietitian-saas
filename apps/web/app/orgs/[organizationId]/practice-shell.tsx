"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, api } from "../../../lib/api";

interface OrgDetail {
  id: string;
  name: string;
  role: string;
  status: string;
}

export function PracticeShell({ children }: { children: ReactNode }) {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
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

  if (state === "loading") {
    return <main style={pageStyle}>Loading practice…</main>;
  }
  if (state === "unauth") {
    return (
      <main style={pageStyle}>
        <p>Sign in required.</p>
        <Link href="/auth" style={{ color: "var(--color-accent)" }}>
          Sign in
        </Link>
      </main>
    );
  }
  if (state === "forbidden") {
    return (
      <main style={pageStyle}>
        <h1>Practice is not available</h1>
        <Link href="/orgs" style={{ color: "var(--color-accent)" }}>
          Organizations
        </Link>
      </main>
    );
  }

  const nav = [
    { href: `/orgs/${organizationId}`, label: "Dashboard" },
    { href: `/orgs/${organizationId}/clients`, label: "Clients" },
    { href: `/orgs/${organizationId}/foods`, label: "Foods" },
    { href: `/orgs/${organizationId}/recipes`, label: "Recipes" },
    { href: `/orgs/${organizationId}/meal-plans`, label: "Meal plans" },
    { href: `/orgs/${organizationId}/messages`, label: "Messages" },
    { href: `/orgs/${organizationId}/invoices`, label: "Invoices" },
    { href: `/orgs/${organizationId}/tasks`, label: "Tasks" },
    { href: `/orgs/${organizationId}/automations`, label: "Automations" },
    { href: `/orgs/${organizationId}/analytics`, label: "Analytics" },
    { href: `/orgs/${organizationId}/settings`, label: "Settings" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "220px 1fr" }}>
      <aside
        style={{
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          padding: "1.25rem",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-muted)", letterSpacing: "0.04em" }}>
          PRACTICE
        </p>
        <p style={{ margin: "0.35rem 0 0.25rem", fontWeight: 600 }}>{org?.name}</p>
        <p style={{ margin: "0 0 1rem", fontSize: 13, color: "var(--color-muted)" }}>{org?.role}</p>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} style={{ color: "var(--color-accent)" }}>
              {item.label}
            </Link>
          ))}
        </nav>
        <p style={{ marginTop: 24, fontSize: 13 }}>
          <Link href="/orgs" style={{ color: "var(--color-muted)" }}>
            All organizations
          </Link>
        </p>
      </aside>
      <main style={{ padding: "1.5rem 2rem" }}>{children}</main>
    </div>
  );
}

export const pageStyle: CSSProperties = { padding: "2rem" };

export const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

export const buttonStyle: CSSProperties = {
  padding: "0.5rem 0.85rem",
  background: "var(--color-accent)",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  cursor: "pointer",
};

export const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 12,
};

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "var(--color-surface)",
};

export const cellStyle: CSSProperties = {
  borderBottom: "1px solid var(--color-border)",
  padding: "0.6rem 0.75rem",
  textAlign: "left",
  fontSize: 14,
};
