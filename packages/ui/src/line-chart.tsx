"use client";

import { useId, useMemo, useState } from "react";

export type LineChartPoint = {
  at: string;
  value: number;
  label?: string;
};

export type LineChartProps = {
  points: LineChartPoint[];
  unit?: string;
  emptyTitle?: string;
  height?: number;
};

function formatAxisDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Lightweight SVG line chart — no third-party chart library. */
export function LineChart({
  points,
  unit = "",
  emptyTitle = "Not enough data to chart",
  height = 220,
}: LineChartProps) {
  const gradId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (points.length === 0) return null;
    const pad = { top: 16, right: 16, bottom: 36, left: 44 };
    const width = 640;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const values = points.map((p) => p.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = maxV - minV || Math.max(Math.abs(maxV) * 0.1, 1);
    const yMin = minV - span * 0.08;
    const yMax = maxV + span * 0.08;
    const xs = points.map((_, i) =>
      points.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (points.length - 1)) * innerW,
    );
    const ys = points.map(
      (p) => pad.top + innerH - ((p.value - yMin) / (yMax - yMin)) * innerH,
    );
    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xs[i]!.toFixed(1)} ${ys[i]!.toFixed(1)}`)
      .join(" ");
    const area =
      points.length > 1
        ? `${line} L ${xs[xs.length - 1]!.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${xs[0]!.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
        : "";
    const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v * 100) / 100);
    return { pad, width, height, innerW, innerH, xs, ys, line, area, yTicks, yMin, yMax };
  }, [points, height]);

  if (!layout || points.length === 0) {
    return (
      <div className="ui-line-chart ui-line-chart--empty" role="img" aria-label={emptyTitle}>
        <p className="ui-muted">{emptyTitle}</p>
      </div>
    );
  }

  const tipIdx = hover ?? (points.length > 0 ? points.length - 1 : null);

  return (
    <div className="ui-line-chart">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`Chart${unit ? ` in ${unit}` : ""}`}
        className="ui-line-chart__svg"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {layout.yTicks.map((tick, i) => {
          const y =
            layout.pad.top +
            layout.innerH -
            ((tick - layout.yMin) / (layout.yMax - layout.yMin)) * layout.innerH;
          return (
            <g key={`yt-${i}`}>
              <line
                x1={layout.pad.left}
                x2={layout.width - layout.pad.right}
                y1={y}
                y2={y}
                className="ui-line-chart__grid"
              />
              <text x={layout.pad.left - 8} y={y + 4} textAnchor="end" className="ui-line-chart__tick">
                {tick}
                {unit ? ` ${unit}` : ""}
              </text>
            </g>
          );
        })}
        {layout.area ? <path d={layout.area} fill={`url(#${gradId})`} /> : null}
        <path d={layout.line} className="ui-line-chart__line" fill="none" />
        {points.map((p, i) => (
          <circle
            key={p.at + String(i)}
            cx={layout.xs[i]}
            cy={layout.ys[i]}
            r={tipIdx === i ? 5 : 3.5}
            className="ui-line-chart__dot"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {points.map((p, i) => {
          const show =
            points.length <= 6 || i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2);
          if (!show) return null;
          return (
            <text
              key={`xl-${i}`}
              x={layout.xs[i]}
              y={layout.height - 10}
              textAnchor="middle"
              className="ui-line-chart__tick"
            >
              {formatAxisDate(p.at)}
            </text>
          );
        })}
      </svg>
      {tipIdx != null && points[tipIdx] ? (
        <div className="ui-line-chart__tooltip">
          <strong>
            {points[tipIdx]!.value}
            {unit ? ` ${unit}` : ""}
          </strong>
          <span>{formatAxisDate(points[tipIdx]!.at)}</span>
        </div>
      ) : null}
    </div>
  );
}
