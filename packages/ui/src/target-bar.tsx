"use client";

import type { ReactNode } from "react";

export type TargetBarProps = {
  label: string;
  actual: number | null | undefined;
  target: number | null | undefined;
  unit: string;
  tone?: "energy" | "fat" | "carb" | "protein" | "fiber" | "micro";
  icon?: ReactNode;
  /** Compact horizontal strip layout for Analysis. */
  layout?: "stack" | "row";
};

function WarningIcon() {
  return (
    <svg className="ui-target-bar__warn" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="#eab308"
        d="M7.13 1.62a1 1 0 0 1 1.74 0l6.01 10.7A1 1 0 0 1 14.01 14H1.99a1 1 0 0 1-.87-1.68l6.01-10.7Z"
      />
      <path fill="#713f12" d="M7.4 5.5h1.2v4H7.4zm0 4.8h1.2V11.5H7.4z" />
    </svg>
  );
}

export function TargetBar({
  label,
  actual,
  target,
  unit,
  tone = "micro",
  icon,
  layout = "stack",
}: TargetBarProps) {
  const value = actual ?? 0;
  const goal = target && target > 0 ? target : 0;
  const rawPct = goal > 0 ? (value / goal) * 100 : 0;
  const fillPct = goal > 0 ? Math.min(100, rawPct) : value > 0 ? 6 : 0;
  const over = goal > 0 && value > goal;
  const displayActual = actual == null ? "—" : String(Math.round(actual * 10) / 10);
  const displayTarget = goal > 0 ? String(Math.round(goal * 10) / 10) : "—";

  return (
    <div
      className={`ui-target-bar ui-target-bar--${layout}${over ? " is-over" : ""}`}
      data-tone={tone}
    >
      {icon ? <span className="ui-target-bar__icon">{icon}</span> : null}
      <span className="ui-target-bar__name">{label}</span>
      <div className="ui-target-bar__track" aria-hidden="true">
        <span className="ui-target-bar__fill" style={{ width: `${Math.max(0, fillPct)}%` }} />
      </div>
      {over ? <WarningIcon /> : <span className="ui-target-bar__warn-slot" aria-hidden="true" />}
      <strong className="ui-target-bar__values">
        {displayActual}
        {goal > 0 ? ` / ${displayTarget}` : ""} {unit}
      </strong>
    </div>
  );
}
