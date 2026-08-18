import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <section
        style={{
          maxWidth: 420,
          width: "100%",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
          padding: "2rem",
        }}
      >
        <p style={{ margin: 0, color: "var(--color-muted)", fontSize: 13, letterSpacing: "0.04em" }}>
          NUTRITION SAAS
        </p>
        <h1 style={{ margin: "0.5rem 0 1.25rem", fontSize: 28, fontWeight: 600 }}>{title}</h1>
        {children}
        <p style={{ margin: "1.5rem 0 0", fontSize: 13 }}>
          <Link href="/auth" style={{ color: "var(--color-accent)" }}>
            Sign in
          </Link>
          {" · "}
          <Link href="/auth/register" style={{ color: "var(--color-accent)" }}>
            Register
          </Link>
          {" · "}
          <Link href="/auth/forgot-password" style={{ color: "var(--color-accent)" }}>
            Forgot password
          </Link>
        </p>
      </section>
    </main>
  );
}

export const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 12,
};

export const inputStyle: CSSProperties = {
  padding: "0.65rem 0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 16,
};

export const buttonStyle: CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "0.75rem 1rem",
  background: "var(--color-accent)",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontSize: 16,
  cursor: "pointer",
};
