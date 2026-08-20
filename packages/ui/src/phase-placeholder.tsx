import type { ReactNode } from "react";

interface PhasePlaceholderProps {
  surface: string;
  children?: ReactNode;
}

export function PhasePlaceholder({ surface, children }: PhasePlaceholderProps) {
  return (
    <main className="ui-auth">
      <section className="ui-card ui-auth__card">
        <p className="ui-eyebrow">Nutrition</p>
        <h1 style={{ margin: "0.5rem 0 0.75rem", fontSize: 28, fontWeight: 600 }}>{surface}</h1>
        <p className="ui-muted">
          {children ?? "This surface is a placeholder."}
        </p>
      </section>
    </main>
  );
}
