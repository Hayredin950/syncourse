/**
 * Early-access drops.
 *
 * Anything published after the feature date is Premium-first for seven days.
 * The cutoff is read once per call so the rule can be paused by setting
 * `EARLY_ACCESS_SINCE` in the future, and so seeded historical content — which
 * all carries a recent `publishedAt` — is not retroactively locked.
 */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function earlyAccessSince(): Date {
  const raw = process.env.EARLY_ACCESS_SINCE || '2026-11-21T00:00:00.000Z';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date('2026-11-21T00:00:00.000Z') : parsed;
}

/** When this item stops being Premium-first, or null when it never was. */
export function earlyAccessUntil(publishedAt: Date | string | null | undefined): Date | null {
  if (!publishedAt) return null;
  const published = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;
  if (published < earlyAccessSince()) return null;
  return new Date(published.getTime() + WINDOW_MS);
}

/** True while the item is still inside its Premium-only head start. */
export function isEarlyAccess(publishedAt: Date | string | null | undefined, now = new Date()): boolean {
  const until = earlyAccessUntil(publishedAt);
  return !!until && until > now;
}
