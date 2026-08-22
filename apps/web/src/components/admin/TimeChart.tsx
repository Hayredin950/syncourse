"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * One series over time — area or columns, with a hover readout.
 *
 * Deliberately single-series: two measures on one frame would need two y-scales,
 * and a dual-axis chart can be made to show any correlation you like. Two
 * measures means two of these side by side.
 *
 * The value lives in the tooltip rather than on every column, and the exact
 * numbers live in the table view its card provides — a chart with a number over
 * each bar is a table that has been made harder to read.
 */
export interface ChartPoint {
  /** Pre-formatted x label. */
  label: string;
  value: number;
}

const PAD = { t: 12, r: 12, b: 22, l: 48 };

export default function TimeChart({
  points,
  kind = "area",
  height = 196,
  format = (v: number) => Math.round(v).toLocaleString("en-US"),
  ariaLabel,
}: {
  points: ChartPoint[];
  kind?: "area" | "bar";
  height?: number;
  format?: (v: number) => string;
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  const [hover, setHover] = useState<number | null>(null);
  const gid = `adm-area-${useId().replace(/[:]/g, "")}`;

  // Measured rather than percentage-scaled: a viewBox stretched to fit would
  // distort the stroke weight and the 2px gaps along with the geometry.
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const iw = width - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const bandW = iw / Math.max(1, n);
  const xLine = (i: number) => PAD.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const xBand = (i: number) => PAD.l + i * bandW;
  const centre = (i: number) => (kind === "bar" ? xBand(i) + bandW / 2 : xLine(i));

  const line = points.map((p, i) => `${i ? "L" : "M"}${xLine(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${xLine(n - 1).toFixed(1)} ${PAD.t + ih} L${xLine(0).toFixed(1)} ${PAD.t + ih} Z`;

  const pick = (clientX: number, box: DOMRect) => {
    const rel = clientX - box.left - PAD.l;
    const i =
      kind === "bar" ? Math.floor(rel / bandW) : Math.round(rel / (n === 1 ? iw : iw / (n - 1)));
    return Math.min(n - 1, Math.max(0, i));
  };

  const tipAt = hover == null ? null : points[hover];

  return (
    <div className="admin-chart-wrap" ref={wrap}>
      <svg
        className="admin-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          setHover((h) => {
            const next = (h ?? (e.key === "ArrowRight" ? -1 : n)) + (e.key === "ArrowRight" ? 1 : -1);
            return Math.min(n - 1, Math.max(0, next));
          });
        }}
        onBlur={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--adm-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--adm-accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Three gridlines and three labels: enough to read a magnitude, quiet
            enough that the series stays the loudest thing in the frame. */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              className="admin-chart__grid"
              x1={PAD.l}
              x2={PAD.l + iw}
              y1={PAD.t + ih - f * ih}
              y2={PAD.t + ih - f * ih}
            />
            <text className="admin-chart__axis" x={PAD.l - 8} y={PAD.t + ih - f * ih + 3} textAnchor="end">
              {format(top * f)}
            </text>
          </g>
        ))}

        {kind === "area" ? (
          <>
            {/* Inline style, not a fill attribute: a presentation attribute loses
                to the class rule in admin.css, which is the flat fallback. */}
            <path className="admin-chart__area" d={area} style={{ fill: `url(#${gid})` }} />
            <path className="admin-chart__line" d={line} />
          </>
        ) : (
          points.map((p, i) => {
            const h = (p.value / top) * ih;
            if (h <= 0) return null;
            return (
              <path
                key={i}
                className={`admin-chart__bar ${hover === i ? "admin-chart__bar--hi" : ""}`}
                d={barPath(xBand(i) + 1, Math.max(1, bandW - 2), Math.max(1.5, h), PAD.t + ih)}
              />
            );
          })
        )}

        {/* First, middle and last only — a label under every column collides at
            any width narrower than a spreadsheet. */}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
          .map((i) => (
            <text
              key={i}
              className="admin-chart__axis"
              x={centre(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {points[i].label}
            </text>
          ))}

        {hover != null && (
          <>
            <line
              className="admin-chart__cross"
              x1={centre(hover)}
              x2={centre(hover)}
              y1={PAD.t}
              y2={PAD.t + ih}
            />
            {kind === "area" && (
              <circle className="admin-chart__dot" cx={xLine(hover)} cy={y(points[hover].value)} r={3.4} />
            )}
          </>
        )}

        {/* One hit area over the whole plot, so the target is the column of space
            above a mark rather than the mark itself. */}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={Math.max(0, iw)}
          height={ih}
          fill="transparent"
          onPointerMove={(e) => setHover(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {tipAt && (
        <div
          className="admin-chart-tip"
          style={{ left: Math.min(width - 60, Math.max(60, centre(hover!))) }}
          aria-hidden
        >
          <strong>{format(tipAt.value)}</strong>
          <span>{tipAt.label}</span>
        </div>
      )}
    </div>
  );
}

/** Round the axis top up to something a person would have chosen. */
function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => v <= s * mag * 1.000001);
  return (step ?? 10) * mag;
}

/**
 * A column with a rounded data-end and a square base. `rx` on a rect would round
 * the baseline too, which floats the bar off the axis it is measured against.
 */
function barPath(x: number, w: number, h: number, base: number): string {
  const r = Math.min(4, w / 2, h);
  const t = base - h;
  return [
    `M${x} ${base}`,
    `L${x} ${t + r}`,
    `Q${x} ${t} ${x + r} ${t}`,
    `L${x + w - r} ${t}`,
    `Q${x + w} ${t} ${x + w} ${t + r}`,
    `L${x + w} ${base}`,
    "Z",
  ].join(" ");
}
