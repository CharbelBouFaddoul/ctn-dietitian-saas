"use client";

export type BarListRow = {
  id: string;
  label: string;
  value: number;
  /** Optional bar color; defaults to the accent token. */
  color?: string;
};

export type BarListProps = {
  rows: BarListRow[];
  /** Formats the trailing value (counts by default). */
  formatValue?: (value: number) => string;
  emptyLabel?: string;
};

function defaultFormat(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat().format(Math.round(value));
}

/** Horizontal bars scaled to the largest value in the set. */
export function BarList({ rows, formatValue = defaultFormat, emptyLabel = "No data" }: BarListProps) {
  const max = rows.reduce((peak, row) => Math.max(peak, row.value), 0);
  if (rows.length === 0 || max <= 0) {
    return <p className="ui-muted ui-bar-list__empty">{emptyLabel}</p>;
  }

  return (
    <ul className="ui-bar-list">
      {rows.map((row) => {
        const pct = max > 0 ? Math.max(row.value > 0 ? 3 : 0, (row.value / max) * 100) : 0;
        return (
          <li key={row.id} className="ui-bar-list__row">
            <span className="ui-bar-list__label">{row.label}</span>
            <span className="ui-bar-list__track">
              <span
                className="ui-bar-list__fill"
                style={{ width: `${pct}%`, background: row.color ?? "var(--color-accent)" }}
              />
            </span>
            <span className="ui-bar-list__value">{formatValue(row.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
