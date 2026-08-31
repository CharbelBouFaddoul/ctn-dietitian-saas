"use client";

import { useState, type ReactNode } from "react";

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

export type DonutChartProps = {
  slices: DonutSlice[];
  size?: number;
  /** Radial thickness of the ring (outer − inner). */
  thickness?: number;
  emptyLabel?: string;
  caption?: string;
  /** Hide the legend and render only the ring. */
  legend?: boolean;
  /** Show percent next to legend labels. Default true. */
  showPct?: boolean;
  /** Show absolute value (+ unit) next to legend labels. Default false. */
  showValue?: boolean;
  /** Unit shown in the hover tip / legend value, e.g. "kcal" or "g". */
  valueUnit?: string;
  /** Content rendered in the middle of the ring; hidden while a slice is hovered. */
  center?: ReactNode;
  /** When false, slices don't respond to hover (no dim/tip). Default true. */
  interactive?: boolean;
};

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Filled donut wedge between innerR and outerR. */
function wedgePath(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number) {
  const sweep = Math.max(0, Math.min(359.999, end - start));
  if (sweep <= 0) return "";
  const large = sweep > 180 ? 1 : 0;
  const oStart = polar(cx, cy, outerR, start);
  const oEnd = polar(cx, cy, outerR, end);
  const iEnd = polar(cx, cy, innerR, end);
  const iStart = polar(cx, cy, innerR, start);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${iStart.x} ${iStart.y}`,
    "Z",
  ].join(" ");
}

function formatValue(value: number) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function contrastingInk(color: string): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return "#fff";
  let raw = match[1]!;
  if (raw.length === 3) raw = raw.split("").map((ch) => ch + ch).join("");
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 165 ? "#0f172a" : "#fff";
}

export function DonutChart({
  slices,
  size = 112,
  thickness = 14,
  emptyLabel = "No data",
  caption,
  legend = true,
  showPct = true,
  showValue = false,
  valueUnit,
  center,
  interactive = true,
}: DonutChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = Math.max(8, outerR - thickness);

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
            const pct = (slice.value / total) * 100;
            return {
              ...slice,
              start,
              end,
              pct,
              pctLabel: `${pct.toFixed(1)}%`,
            };
          });

  const gapDeg = arcs.length > 1 ? 0.7 : 0;
  const activeArc = arcs.find((arc) => arc.label === active) ?? null;

  return (
    <div className={`ui-donut${legend ? "" : " ui-donut--ring"}`}>
      <div className="ui-donut__chart">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="ui-donut__svg"
          role="img"
          aria-label={caption ?? "Distribution chart"}
        >
          <circle cx={cx} cy={cy} r={(outerR + innerR) / 2} fill="none" stroke="rgb(15 23 42 / 6%)" strokeWidth={thickness} />
          {arcs.length === 0 ? null : arcs.length === 1 ? (
            <path
              d={wedgePath(cx, cy, innerR, outerR, 0, 359.999)}
              fill={arcs[0]!.color}
              className={`ui-donut__slice${interactive ? "" : " ui-donut__slice--static"}`}
              onMouseEnter={interactive ? () => setActive(arcs[0]!.label) : undefined}
              onMouseLeave={interactive ? () => setActive(null) : undefined}
            />
          ) : (
            arcs.map((arc) => {
              const start = arc.start + gapDeg / 2;
              const end = arc.end - gapDeg / 2;
              if (end <= start) return null;
              return (
                <path
                  key={arc.label}
                  d={wedgePath(cx, cy, innerR, outerR, start, end)}
                  fill={arc.color}
                  stroke="#fff"
                  strokeWidth={1}
                  paintOrder="fill stroke"
                  className={`ui-donut__slice${interactive ? "" : " ui-donut__slice--static"}${active && active !== arc.label ? " is-dim" : ""}${active === arc.label ? " is-active" : ""}`}
                  onMouseEnter={interactive ? () => setActive(arc.label) : undefined}
                  onMouseLeave={interactive ? () => setActive(null) : undefined}
                />
              );
            })
          )}
        </svg>
        {center && !activeArc ? <div className="ui-donut__center">{center}</div> : null}
        {activeArc ? (
          <div className="ui-donut__tip">
            <span className="ui-donut__tip-pill" style={{ background: activeArc.color, color: contrastingInk(activeArc.color) }}>
              {activeArc.label}
            </span>
            <span className="ui-donut__tip-stats">
              <em>{activeArc.pctLabel}</em>
              <strong>
                {formatValue(activeArc.value)}
                {valueUnit ? ` ${valueUnit}` : ""}
              </strong>
            </span>
          </div>
        ) : null}
      </div>
      {legend ? (
        <ul className="ui-donut__legend">
          {caption ? <li className="ui-donut__caption">{caption}</li> : null}
          {total <= 0 ? (
            <li className="ui-muted">{emptyLabel}</li>
          ) : (
            arcs.map((arc) => (
              <li
                key={arc.label}
                className={active && active !== arc.label ? "is-dim" : active === arc.label ? "is-active" : undefined}
                onMouseEnter={() => setActive(arc.label)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="ui-donut__swatch" style={{ background: arc.color }} />
                <span className="ui-donut__name">
                  {arc.label}
                  {showPct || showValue ? (
                    <span className="ui-donut__meta">
                      {showPct ? ` ${Math.round(arc.pct)}%` : ""}
                      {showValue
                        ? `${showPct ? " · " : " "}${formatValue(arc.value)}${valueUnit ? ` ${valueUnit}` : ""}`
                        : ""}
                    </span>
                  ) : null}
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
