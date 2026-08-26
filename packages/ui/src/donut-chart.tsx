"use client";

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

export type DonutChartProps = {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  emptyLabel?: string;
  caption?: string;
  /** Hide the legend and render only the ring. */
  legend?: boolean;
};

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export function DonutChart({
  slices,
  size = 112,
  thickness = 16,
  emptyLabel = "No data",
  caption,
  legend = true,
}: DonutChartProps) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2;

  let cursor = 0;
  const arcs =
    total <= 0
      ? []
      : slices
          .filter((slice) => slice.value > 0)
          .map((slice) => {
            const sweep = (slice.value / total) * 360;
            const start = cursor;
            const end = cursor + sweep;
            cursor = end;
            return { ...slice, start, end, pct: Math.round((slice.value / total) * 100) };
          });

  return (
    <div className={`ui-donut${legend ? "" : " ui-donut--ring"}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="ui-donut__svg" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(15 23 42 / 8%)" strokeWidth={thickness} />
        {arcs.length === 0 ? null : arcs.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={arcs[0]!.color} strokeWidth={thickness} />
        ) : (
          arcs.map((arc) => (
            <path
              key={arc.label}
              d={arcPath(cx, cy, r, arc.start, arc.end)}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
            />
          ))
        )}
      </svg>
      {legend ? (
        <ul className="ui-donut__legend">
          {caption ? <li className="ui-donut__caption">{caption}</li> : null}
          {total <= 0 ? (
            <li className="ui-muted">{emptyLabel}</li>
          ) : (
            arcs.map((arc) => (
              <li key={arc.label}>
                <span className="ui-donut__swatch" style={{ background: arc.color }} />
                <span>
                  {arc.label} {arc.pct}%
                </span>
              </li>
            ))
          )}
        </ul>
      ) : caption ? (
        <span className="ui-donut__caption">{caption}</span>
      ) : null}
    </div>
  );
}
