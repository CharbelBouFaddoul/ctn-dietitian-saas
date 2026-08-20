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
  /** SVG viewBox height; keep compact by default. */
  height?: number;
};

function formatAxisDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100) return String(Math.round(value));
  if (abs >= 10) return (Math.round(value * 10) / 10).toString();
  return (Math.round(value * 100) / 100).toString();
}

/** Round domain outward to readable tick steps (~3–4 ticks). */
function niceDomain(minV: number, maxV: number): { yMin: number; yMax: number; ticks: number[] } {
  const span = maxV - minV || Math.max(Math.abs(maxV) * 0.08, 1);
  let yMin = minV - span * 0.1;
  let yMax = maxV + span * 0.1;
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const targetGaps = 3;
  const rawStep = (yMax - yMin) / targetGaps;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1e-6)));
  const residual = rawStep / magnitude;
  const niceResidual =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = niceResidual * magnitude;
  const niceMin = Math.floor(yMin / step) * step;
  const niceMax = Math.ceil(yMax / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
    if (ticks.length > 8) break;
  }
  if (ticks.length < 2) {
    return { yMin: niceMin, yMax: niceMax || niceMin + step, ticks: [niceMin, niceMax || niceMin + step] };
  }
  return { yMin: niceMin, yMax: niceMax, ticks };
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
    const pad = { top: 12, right: 14, bottom: 28, left: 42 };
    const width = 640;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const values = points.map((p) => p.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const { yMin, yMax, ticks: yTicks } = niceDomain(minV, maxV);
    const xs = points.map((_, i) =>
      points.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (points.length - 1)) * innerW,
    );
    const ys = points.map(
      (p) => pad.top + innerH - ((p.value - yMin) / (yMax - yMin || 1)) * innerH,
    );
    const line = points
      .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]!.toFixed(1)} ${ys[i]!.toFixed(1)}`)
      .join(" ");
    const area =
      points.length > 1
        ? `${line} L ${xs[xs.length - 1]!.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${xs[0]!.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
        : "";
    return { pad, width, height, innerW, innerH, xs, ys, line, area, yTicks, yMin, yMax };
  }, [points, height]);

  if (!layout || points.length === 0) {
    return (
      <div className="ui-line-chart ui-line-chart--empty" role="img" aria-label={emptyTitle}>
        <p className="ui-muted">{emptyTitle}</p>
      </div>
    );
  }

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
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {layout.yTicks.map((tick, i) => {
          const y =
            layout.pad.top +
            layout.innerH -
            ((tick - layout.yMin) / (layout.yMax - layout.yMin || 1)) * layout.innerH;
          return (
            <g key={`yt-${i}`}>
              <line
                x1={layout.pad.left}
                x2={layout.width - layout.pad.right}
                y1={y}
                y2={y}
                className="ui-line-chart__grid"
              />
              <text x={layout.pad.left - 6} y={y + 3.5} textAnchor="end" className="ui-line-chart__tick">
                {formatTick(tick)}
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
            r={hover === i ? 5 : 3.25}
            className="ui-line-chart__dot"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {/* Endpoint value callouts when few points — avoids a permanent footer tooltip */}
        {points.length <= 4
          ? points.map((p, i) => {
              const x = layout.xs[i]!;
              const y = layout.ys[i]!;
              const above = y > layout.pad.top + 18;
              return (
                <text
                  key={`vl-${i}`}
                  x={x}
                  y={above ? y - 10 : y + 16}
                  textAnchor="middle"
                  className="ui-line-chart__value"
                >
                  {formatTick(p.value)}
                  {unit ? ` ${unit}` : ""}
                </text>
              );
            })
          : null}
        {points.map((p, i) => {
          const show =
            points.length <= 6 || i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2);
          if (!show) return null;
          return (
            <text
              key={`xl-${i}`}
              x={layout.xs[i]}
              y={layout.height - 8}
              textAnchor="middle"
              className="ui-line-chart__tick"
            >
              {formatAxisDate(p.at)}
            </text>
          );
        })}
      </svg>
      {hover != null && points[hover] ? (
        <div className="ui-line-chart__tooltip" aria-live="polite">
          <strong>
            {formatTick(points[hover]!.value)}
            {unit ? ` ${unit}` : ""}
          </strong>
          <span className="ui-muted">{formatAxisDate(points[hover]!.at)}</span>
        </div>
      ) : (
        <div className="ui-line-chart__tooltip ui-line-chart__tooltip--hint">
          <span className="ui-muted">
            {points.length} reading{points.length === 1 ? "" : "s"}
            {unit ? ` · ${unit}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
