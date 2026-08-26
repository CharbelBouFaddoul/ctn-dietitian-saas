"use client";

export type TargetBarProps = {
  label: string;
  actual: number | null | undefined;
  target: number | null | undefined;
  unit: string;
  tone?: "energy" | "fat" | "carb" | "protein" | "fiber" | "micro";
};

export function TargetBar({ label, actual, target, unit, tone = "micro" }: TargetBarProps) {
  const value = actual ?? 0;
  const goal = target && target > 0 ? target : 0;
  const rawPct = goal > 0 ? (value / goal) * 100 : 0;
  const scale = 125;
  const fillPct = goal > 0 ? Math.min(100, (rawPct / scale) * 100) : value > 0 ? 6 : 0;
  const markerPct = (100 / scale) * 100;
  const over = goal > 0 && value > goal * 1.05;
  const displayActual = actual == null ? "—" : String(Math.round(actual * 10) / 10);
  const displayTarget = goal > 0 ? String(Math.round(goal * 10) / 10) : "—";
  const pctLabel = goal > 0 ? ` · ${Math.round(rawPct)}%` : "";

  return (
    <div className={`ui-target-bar${over ? " is-over" : ""}`} data-tone={tone}>
      <div className="ui-target-bar__meta">
        <span>{label}</span>
        <strong>
          {displayActual}
          {goal > 0 ? ` / ${displayTarget}` : ""} {unit}
          {pctLabel}
        </strong>
      </div>
      <div className="ui-target-bar__track" aria-hidden="true">
        <span className="ui-target-bar__fill" style={{ width: `${Math.max(0, fillPct)}%` }} />
        {goal > 0 ? <span className="ui-target-bar__marker" style={{ left: `${markerPct}%` }} /> : null}
      </div>
    </div>
  );
}
