"use client";

/**
 * Sparkline — a 12-point shape, not a chart.
 *
 * Deliberately axis-less and label-less: it sits inside a stat tile whose value
 * already carries the number, so its only job is "which way has this been
 * going". The line is drawn in the de-emphasis hue with the current period
 * marked in the accent, which is what makes the tile readable at a glance
 * without a legend.
 */
export default function Sparkline({
  data,
  width = 76,
  height = 26,
  label,
}: {
  data: number[];
  width?: number;
  height?: number;
  /** Screen-reader description — the shape is decoration without one. */
  label?: string;
}) {
  if (data.length < 2) return null;

  const pad = 3;
  const max = Math.max(...data);
  const min = Math.min(...data);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);
  const y = (v: number) =>
    max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2);

  const pts = data.map((v, i) => [pad + i * stepX, y(v)] as const);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height} L${pts[0][0].toFixed(1)} ${height} Z`;
  const [tipX, tipY] = pts[pts.length - 1];

  return (
    <svg
      className="admin-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path className="admin-spark__area" d={area} />
      <path className="admin-spark__line" d={line} />
      <circle className="admin-spark__tip" cx={tipX} cy={tipY} r={2.6} />
    </svg>
  );
}
