"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "../../lib/api";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/features", label: "Features" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/food-sources", label: "Food sources" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminShell({ children }: { children: ReactNode }) {
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

  if (state === "loading") {
    return <main style={pageStyle}>Checking platform access…</main>;
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
        <h1>Platform administration is not available</h1>
        <p>This area requires a platform role. Organization OWNER is not sufficient.</p>
        <Link href="/orgs" style={{ color: "var(--color-accent)" }}>
          Organizations
        </Link>
      </main>
    );
  }

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
          PLATFORM ADMIN
        </p>
        <p style={{ margin: "0.35rem 0 1rem", fontSize: 13 }}>{role}</p>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} style={{ color: "var(--color-accent)" }}>
              {item.label}
            </Link>
          ))}
        </nav>
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
};

export const buttonStyle: CSSProperties = {
  padding: "0.5rem 0.85rem",
  background: "var(--color-accent)",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  cursor: "pointer",
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
