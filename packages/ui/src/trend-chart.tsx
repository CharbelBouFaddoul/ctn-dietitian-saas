"use client";

import { useId, useMemo, useState } from "react";

export type TrendPoint = {
  at: string;
  /** First (primary) series value. */
  primary: number;
  /** Optional second (compare) series value drawn on the same axis. */
  compare?: number;
};

export type TrendChartProps = {
  points: TrendPoint[];
  /** Legend + tooltip label for the primary series. */
  primaryLabel: string;
  /** Legend + tooltip label for the compare series (omit for single series). */
  compareLabel?: string;
  /** Formats series values in the tooltip (money, counts, …). */
  formatValue?: (value: number) => string;
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
  if (abs >= 1000) return `${Math.round(value / 100) / 10}k`;
  if (abs >= 100) return String(Math.round(value));
  if (abs >= 10) return (Math.round(value * 10) / 10).toString();
  return (Math.round(value * 100) / 100).toString();
}

/** Round domain outward to readable tick steps (~3 gaps). */
function niceDomain(minV: number, maxV: number): { yMin: number; yMax: number; ticks: number[] } {
  const span = maxV - minV || Math.max(Math.abs(maxV) * 0.08, 1);
  let yMin = Math.min(0, minV) - (minV < 0 ? span * 0.1 : 0);
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

/** Monotone cubic path (Fritsch–Carlson) — smooth without overshoot past local extremes. */
function smoothLinePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M ${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1]! - xs[i]!;
    slope[i] = (ys[i + 1]! - ys[i]!) / (dx[i]! || 1e-6);
  }

  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = slope[0]!;
  tangents[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1]! * slope[i]! <= 0) tangents[i] = 0;
    else tangents[i] = (slope[i - 1]! + slope[i]!) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slope[i]!) < 1e-12) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / slope[i]!;
    const b = tangents[i + 1]! / slope[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[i] = t * a * slope[i]!;
      tangents[i + 1] = t * b * slope[i]!;
    }
  }

  let d = `M ${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const y0 = ys[i]!;
    const y1 = ys[i + 1]!;
    const h = dx[i]!;
    d += ` C ${(x0 + h / 3).toFixed(1)} ${(y0 + (tangents[i]! * h) / 3).toFixed(1)}, ${(x1 - h / 3).toFixed(1)} ${(y1 - (tangents[i + 1]! * h) / 3).toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/** Lightweight SVG trend chart for one or two series sharing a y-axis. */
export function TrendChart({
  points,
  primaryLabel,
  compareLabel,
  formatValue = formatTick,
  emptyTitle = "Not enough data to chart",
  height = 220,
}: TrendChartProps) {
  const gradId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const hasCompare = Boolean(compareLabel);

  const layout = useMemo(() => {
    if (points.length === 0) return null;
    const pad = { top: 16, right: 16, bottom: 28, left: 42 };
    const width = 640;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const values = points.flatMap((p) => (hasCompare ? [p.primary, p.compare ?? 0] : [p.primary]));
    const minV = Math.min(...values, 0);
    const maxV = Math.max(...values, 0);
    const { yMin, yMax, ticks: yTicks } = niceDomain(minV, maxV);
    const xAt = (i: number) =>
      points.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (points.length - 1)) * innerW;
    const yAt = (v: number) => pad.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
    const xs = points.map((_, i) => xAt(i));
    const primaryYs = points.map((p) => yAt(p.primary));
    const compareYs = points.map((p) => yAt(p.compare ?? 0));
    const primaryLine = smoothLinePath(xs, primaryYs);
    const compareLine = hasCompare ? smoothLinePath(xs, compareYs) : "";
    const baseline = yAt(Math.max(0, yMin));
    const area =
      points.length > 1
        ? `${primaryLine} L ${xs[xs.length - 1]!.toFixed(1)} ${baseline.toFixed(1)} L ${xs[0]!.toFixed(1)} ${baseline.toFixed(1)} Z`
        : "";
    return { pad, width, height, innerW, innerH, xs, yAt, primaryLine, compareLine, area, yTicks, yMin, yMax };
  }, [points, height, hasCompare]);

  if (!layout || points.length === 0) {
    return (
      <div className="ui-line-chart ui-line-chart--empty" role="img" aria-label={emptyTitle}>
        <p className="ui-muted">{emptyTitle}</p>
      </div>
    );
  }

  const active = hover != null ? points[hover] : null;
  const tipLeftPct = hover != null ? (layout.xs[hover]! / layout.width) * 100 : 0;
  const tipOnRight = tipLeftPct < 55;
  const hoverHasValue =
    active != null && (active.primary > 0 || (hasCompare && (active.compare ?? 0) > 0));

  return (
    <div className="ui-line-chart ui-trend">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={hasCompare ? `${primaryLabel} vs ${compareLabel}` : primaryLabel}
        className="ui-line-chart__svg"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="55%" stopColor="var(--color-accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {layout.yTicks.map((tick, i) => {
          const y = layout.yAt(tick);
          return (
            <g key={`yt-${i}`}>
              <line
                x1={layout.pad.left}
                x2={layout.width - layout.pad.right}
                y1={y}
                y2={y}
                className="ui-line-chart__grid"
              />
              <text x={layout.pad.left - 8} y={y + 3} textAnchor="end" className="ui-line-chart__tick">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
        {layout.area ? <path d={layout.area} fill={`url(#${gradId})`} className="ui-trend__area" /> : null}
        {hasCompare ? <path d={layout.compareLine} className="ui-trend__compare" fill="none" /> : null}
        <path d={layout.primaryLine} className="ui-line-chart__line ui-trend__primary" fill="none" />
        {hover != null && hoverHasValue ? (
          <line
            x1={layout.xs[hover]}
            x2={layout.xs[hover]}
            y1={layout.pad.top}
            y2={layout.height - layout.pad.bottom}
            className="ui-trend__cursor"
          />
        ) : null}
        {points.map((p, i) => {
          const showPrimary = p.primary > 0 || hover === i;
          const showCompare = hasCompare && ((p.compare ?? 0) > 0 || hover === i);
          if (!showPrimary && !showCompare) return null;
          return (
            <g key={p.at + String(i)}>
              {showPrimary && p.primary > 0 ? (
                <circle
                  cx={layout.xs[i]}
                  cy={layout.yAt(p.primary)}
                  r={hover === i ? 5 : 3.5}
                  className="ui-line-chart__dot"
                  pointerEvents="none"
                />
              ) : null}
              {showPrimary && p.primary <= 0 && hover === i ? (
                <circle
                  cx={layout.xs[i]}
                  cy={layout.yAt(p.primary)}
                  r={3.5}
                  className="ui-line-chart__dot ui-trend__dot-muted"
                  pointerEvents="none"
                />
              ) : null}
              {showCompare && (p.compare ?? 0) > 0 ? (
                <circle
                  cx={layout.xs[i]}
                  cy={layout.yAt(p.compare ?? 0)}
                  r={hover === i ? 5 : 3.5}
                  className="ui-trend__dot-compare"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}
        {points.map((p, i) => {
          const bandW = layout.innerW / Math.max(1, points.length);
          return (
            <rect
              key={`hit-${i}`}
              x={layout.xs[i]! - bandW / 2}
              y={layout.pad.top}
              width={bandW}
              height={layout.innerH}
              fill="transparent"
              className="ui-line-chart__hit"
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
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

      <div className="ui-trend__legend" aria-hidden="true">
        <span className="ui-trend__legend-item">
          <span className="ui-trend__swatch ui-trend__swatch--primary" />
          {primaryLabel}
        </span>
        {hasCompare ? (
          <span className="ui-trend__legend-item">
            <span className="ui-trend__swatch ui-trend__swatch--compare" />
            {compareLabel}
          </span>
        ) : null}
      </div>

      {active && hover != null && hoverHasValue ? (
        <div
          className={`ui-line-chart__tip${tipOnRight ? " ui-line-chart__tip--right" : " ui-line-chart__tip--left"}`}
          style={{ left: `${tipLeftPct}%`, top: "8%" }}
          aria-live="polite"
        >
          <div className="ui-line-chart__tip-date">{formatAxisDate(active.at)}</div>
          <div className="ui-line-chart__tip-row">
            <span className="ui-line-chart__tip-badge">{primaryLabel}</span>
            <strong className="ui-line-chart__tip-value">{formatValue(active.primary)}</strong>
          </div>
          {hasCompare ? (
            <div className="ui-line-chart__tip-row">
              <span className="ui-line-chart__tip-badge ui-trend__tip-badge--compare">{compareLabel}</span>
              <strong className="ui-line-chart__tip-value">{formatValue(active.compare ?? 0)}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
