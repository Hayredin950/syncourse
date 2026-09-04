/**
 * A runtime, or nothing at all.
 *
 * Returns `""` rather than an em dash for an unknown duration. Courses here are
 * delivered through Telegram, so most have no lesson runtimes to add up — and a
 * dash is not the absence of a fact, it is a fact-shaped placeholder that leaves
 * its separator dangling behind it ("All Levels · —"). Callers drop the empty
 * string from their meta line instead.
 */
export function formatDuration(min: number): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatSec(sec: number): string {
  if (!sec) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ratingColor(avg: number): string {
  if (avg >= 8) return "text-success";
  if (avg >= 6) return "text-accent";
  return "text-muted";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A count and its noun, agreeing.
 *
 * Twenty-eight places wrote this by hand as `{n} {n === 1 ? "course" : "courses"}`,
 * and the ones that didn't bother printed "1 courses" and "1 ratings". Includes
 * the number, and groups it — "1,204 downloads", not "1204 downloads".
 *
 * Mirrors `plural` in the app's `lib/types.ts` so the two surfaces read the same.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
