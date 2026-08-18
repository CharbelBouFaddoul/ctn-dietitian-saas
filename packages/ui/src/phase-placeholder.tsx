import type { ReactNode } from "react";

interface PhasePlaceholderProps {
  surface: string;
  children?: ReactNode;
}

export function PhasePlaceholder({ surface, children }: PhasePlaceholderProps) {
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
          maxWidth: 480,
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
        <h1 style={{ margin: "0.5rem 0 0.75rem", fontSize: 28, fontWeight: 600 }}>{surface}</h1>
        <p style={{ margin: 0, color: "var(--color-muted)", lineHeight: 1.5 }}>
          {children ?? "This surface is a Phase 1 placeholder. Product features land in later phases."}
        </p>
      </section>
    </main>
  );
}
