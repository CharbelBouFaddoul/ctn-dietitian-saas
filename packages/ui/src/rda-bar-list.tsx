"use client";

export type RdaBarRow = {
  id: string;
  label: string;
  actual: number | null | undefined;
  target: number | null | undefined;
  unit: string;
};

export type RdaBarListProps = {
  rows: RdaBarRow[];
  markerLabel?: string;
  compact?: boolean;
};

function fmt(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return (Math.round(value * 10 ** decimals) / 10 ** decimals).toString();
}

export function RdaBarList({ rows, markerLabel = "↑ RDA", compact = false }: RdaBarListProps) {
  const scale = 200;
  const markerPct = (100 / scale) * 100;

  return (
    <div className={`ui-rda${compact ? " ui-rda--compact" : ""}`}>
      <div className="ui-rda__plot">
        <div className="ui-rda__badge-row" aria-hidden="true">
          <span />
          <span />
          <span className="ui-rda__badge-slot">
            <span className="ui-rda__badge" style={{ left: `${markerPct}%` }}>
              {markerLabel}
            </span>
          </span>
        </div>
        <ul className="ui-rda__list">
          {rows.map((row) => {
            const value = row.actual ?? 0;
            const goal = row.target && row.target > 0 ? row.target : 0;
            const rawPct = goal > 0 ? (value / goal) * 100 : 0;
            const fillPct = goal > 0 ? Math.min(100, (rawPct / scale) * 100) : value > 0 ? 4 : 0;
            const over = goal > 0 && value > goal * 1.05;
            return (
              <li key={row.id} className={`ui-rda__row${over ? " is-over" : ""}`}>
                <span className="ui-rda__name">{row.label}</span>
                <span className="ui-rda__values">
                  <strong>{fmt(row.actual)}</strong>
                  {goal > 0 ? ` / ${fmt(goal)}` : ""} {row.unit}
                </span>
                <span className="ui-rda__track">
                  <span className="ui-rda__fill" style={{ width: `${fillPct}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="ui-rda__axis-layer" aria-hidden="true">
          <span />
          <span />
          <span className="ui-rda__axis-slot">
            <span className="ui-rda__axis" style={{ left: `${markerPct}%` }} />
          </span>
        </div>
      </div>
    </div>
  );
}
