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

/**
 * True when a stored file name is a storage key rather than something a person
 * typed.
 *
 * Cloudinary mints a 20-character public id when an upload arrives without
 * `use_filename` — `hsjghfs0im0k6l1p2fzj.mp4`. Printing that as a heading tells a
 * reader nothing except that we did not know what to call the file. The test:
 * one unbroken token, long, carrying digits, and with too few vowels to be
 * language. `algebra-cheatsheet.pdf` keeps its name (separator), so does
 * `Lecture 4.pdf` (space), and so does `roadmap.png` (short, no digits).
 */
export function isOpaqueFileName(name: string): boolean {
  const stem = name.split("/").pop()!.replace(/\.[a-z0-9]{1,5}$/i, "");
  if (stem.length < 12 || /[\s._-]/.test(stem)) return false;
  if (!/\d/.test(stem)) return false;
  const letters = stem.replace(/[^a-z]/gi, "");
  const vowels = stem.replace(/[^aeiou]/gi, "");
  return letters.length > 0 && vowels.length / letters.length < 0.25;
}

/**
 * What to print above a piece of media: the editor's caption if there is one,
 * the uploaded file name if it means anything, and otherwise the generic noun
 * the caller supplies ("Video", "Recording", "Document").
 */
export function mediaTitle(
  item: { fileName?: string | null; caption?: string | null },
  fallback: string,
): string {
  const name = item.fileName?.trim();
  if (name && !isOpaqueFileName(name)) return name;
  const cap = item.caption?.trim();
  if (cap) return cap;
  return fallback;
}
