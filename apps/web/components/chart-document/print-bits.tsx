import type { ReactNode } from "react";
import type { PrintField } from "./types";

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui-chart-doc__section">
      <h3 className="ui-chart-doc__section-title">{title}</h3>
      {children}
    </section>
  );
}

export function DocFields({ fields }: { fields: PrintField[] }) {
  if (fields.length === 0) return <p className="ui-chart-doc__empty">No data</p>;
  return (
    <dl className="ui-chart-doc__fields">
      {fields.map((field) => (
        <div key={field.label} className="ui-chart-doc__field">
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DocTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="ui-chart-doc__empty">{empty ?? "No data"}</p>;
  }
  return (
    <table className="ui-chart-doc__table">
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function measureText(value: number, unit?: string | null): string {
  const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return unit ? `${rounded} ${unit}` : rounded;
}
