"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", maxWidth: 720, margin: "0 auto" }}>
      <header style={{ padding: "1rem", borderBottom: "1px solid var(--color-border)" }}>
        <strong>Client</strong>
        <nav style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <Link href="/client" style={{ color: "var(--color-accent)" }}>
            Home
          </Link>
          <Link href="/client/plan" style={{ color: "var(--color-accent)" }}>
            Plan
          </Link>
          <Link href="/client/tracking" style={{ color: "var(--color-accent)" }}>
            Track
          </Link>
          <span style={{ color: "var(--color-muted)" }}>Progress</span>
          <Link href="/client/messages" style={{ color: "var(--color-accent)" }}>
            Messages
          </Link>
          <Link href="/client/documents" style={{ color: "var(--color-accent)" }}>
            Documents
          </Link>
          <Link href="/client/invoices" style={{ color: "var(--color-accent)" }}>
            Invoices
          </Link>
        </nav>
      </header>
      <div style={{ padding: "1rem" }}>{children}</div>
    </div>
  );
}
