/**
 * Small metric helpers for the admin console.
 *
 * The API's /admin/stats is a set of scalars with no history, so every trend on
 * the dashboard is derived here from the raw rows the list endpoints already
 * return (users carry `createdAt`, payments carry an amount and a date). That
 * keeps the whole thing a front-end change — no new endpoint, no migration —
 * and the numbers are real rather than decorative.
 */

const DAY_MS = 86_400_000;

/** Stat-tile value formatting: 1,284 · 12.9K · 4.2M. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim(n / 1_000)}K`;
  return Math.round(n).toLocaleString("en-US");
}

function trim(v: number): string {
  // 12.9K, but 4M rather than 4.0M.
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/**
 * Bucket timestamps into `buckets` equal slices covering the last `days` days,
 * oldest first. 12 buckets is the sparkline contract; 30 days over 12 buckets is
 * 2.5 days a point, which is smooth enough to read as a shape.
 */
export function bucketByDate(dates: (string | null | undefined)[], days = 30, buckets = 12): number[] {
  const out = new Array(buckets).fill(0);
  const now = Date.now();
  const span = days * DAY_MS;
  const start = now - span;
  const size = span / buckets;
  for (const iso of dates) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t) || t < start || t > now) continue;
    const i = Math.min(buckets - 1, Math.floor((t - start) / size));
    out[i] += 1;
  }
  return out;
}

/** Same bucketing, but summing a value (revenue) instead of counting rows. */
export function bucketBySum(
  rows: { date: string | null | undefined; value: number }[],
  days = 30,
  buckets = 12,
): number[] {
  const out = new Array(buckets).fill(0);
  const now = Date.now();
  const span = days * DAY_MS;
  const start = now - span;
  const size = span / buckets;
  for (const r of rows) {
    if (!r.date) continue;
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t) || t < start || t > now) continue;
    const i = Math.min(buckets - 1, Math.floor((t - start) / size));
    out[i] += r.value;
  }
  return out;
}

/** A running total, for series that only make sense as "how many by now". */
export function runningTotal(series: number[], base = 0): number[] {
  let acc = base;
  return series.map((v) => (acc += v));
}

export interface Delta {
  /** Signed percentage change. `null` when there is no prior period to compare. */
  pct: number | null;
  /** Named period the comparison is against — a delta with no named period is noise. */
  period: string;
  /** Whether a rise is a good thing. Drives the colour, together with direction. */
  upIsGood: boolean;
}

/**
 * Compare the most recent window against the one immediately before it.
 * Counting rows in each half of a 60-day pull gives "last 30 days vs the 30
 * before that" without asking the API for anything extra.
 */
export function periodDelta(
  dates: (string | null | undefined)[],
  days = 30,
  opts: { upIsGood?: boolean; label?: string } = {},
): Delta {
  const now = Date.now();
  const cur = now - days * DAY_MS;
  const prev = now - 2 * days * DAY_MS;
  let a = 0;
  let b = 0;
  for (const iso of dates) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= cur) a += 1;
    else if (t >= prev) b += 1;
  }
  return {
    pct: percentChange(a, b),
    period: opts.label ?? `previous ${days} days`,
    upIsGood: opts.upIsGood ?? true,
  };
}

/**
 * Sum amounts per currency and render them side by side: "12.4K ETB · 32 USD".
 *
 * Payments are taken in ETB or USD, so a single total is not a number that means
 * anything — and printing one of them with a `$` in front makes it worse. When
 * only one currency is present this reads exactly like an ordinary total.
 */
export function moneyByCurrency(rows: { amount: number; currency: string }[], empty = "—"): string {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);
  if (totals.size === 0) return empty;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, sum]) => `${compactNumber(sum)} ${code}`)
    .join(" · ");
}

export interface Bucket {
  /** Pre-formatted x-axis label — the chart never guesses a date format. */
  label: string;
  start: number;
  end: number;
  value: number;
}

/**
 * Labelled bucketing for the analytics page.
 *
 * `bucketByDate` is enough for a sparkline, which has no axis; a real chart needs
 * to say what each column covers, so this carries the bucket bounds and a label
 * with it. `value` defaults to 1, which makes counting rows and summing money the
 * same call.
 */
export function bucketSeries(
  rows: { date: string | null | undefined; value?: number }[],
  opts: { days: number; buckets: number; label?: (start: Date) => string },
): Bucket[] {
  const { days, buckets } = opts;
  const label = opts.label ?? ((d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const now = Date.now();
  const span = days * DAY_MS;
  const start = now - span;
  const size = span / buckets;

  const out: Bucket[] = Array.from({ length: buckets }, (_, i) => ({
    label: label(new Date(start + i * size)),
    start: start + i * size,
    end: start + (i + 1) * size,
    value: 0,
  }));

  for (const r of rows) {
    if (!r.date) continue;
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t) || t < start || t > now) continue;
    const i = Math.min(buckets - 1, Math.floor((t - start) / size));
    out[i].value += r.value ?? 1;
  }
  return out;
}

/**
 * Value-weighted version of `periodDelta`: last `days` against the `days` before
 * it, summing `value` rather than counting rows. Revenue needs this — three $1.99
 * payments and one $5.99 payment are not the same trend.
 */
export function windowDelta(
  rows: { date: string | null | undefined; value?: number }[],
  days: number,
  opts: { upIsGood?: boolean; label?: string } = {},
): Delta {
  const now = Date.now();
  const cur = now - days * DAY_MS;
  const prev = now - 2 * days * DAY_MS;
  let a = 0;
  let b = 0;
  for (const r of rows) {
    if (!r.date) continue;
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= cur) a += r.value ?? 1;
    else if (t >= prev) b += r.value ?? 1;
  }
  return {
    pct: percentChange(a, b),
    period: opts.label ?? `previous ${days} days`,
    upIsGood: opts.upIsGood ?? true,
  };
}

/** Sum of `value` over the last `days` days. */
export function sumSince(rows: { date: string | null | undefined; value?: number }[], days: number): number {
  const cut = Date.now() - days * DAY_MS;
  return rows.reduce((acc, r) => {
    if (!r.date) return acc;
    const t = new Date(r.date).getTime();
    return Number.isFinite(t) && t >= cut ? acc + (r.value ?? 1) : acc;
  }, 0);
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // no baseline — say so rather than "+∞%"
  return ((current - previous) / previous) * 100;
}

/** Count rows whose date falls inside the last `days` days. */
export function countSince(dates: (string | null | undefined)[], days: number): number {
  const cut = Date.now() - days * DAY_MS;
  return dates.filter((d) => d && new Date(d).getTime() >= cut).length;
}

/** Short "3d ago" style stamp for feeds where the exact date does not matter. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
