import type { MetadataRoute } from "next";

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://syncourse-web.vercel.app").replace(/\/$/, "");
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** `output: export` refuses to emit a metadata route that could be dynamic. */
export const dynamic = "force-static";

/**
 * These reads deliberately do NOT reuse `lib/static-params`.
 *
 * Those helpers fetch with `cache: "no-store"`, which a statically exported
 * route rejects outright ("Route /sitemap.xml with dynamic = error couldn't be
 * rendered statically because it used revalidate: 0") and which made every
 * lookup fall back to its placeholder — producing a sitemap of 12 static URLs
 * and no catalogue. A plain cached fetch is what a build-time list wants
 * anyway, and a failure just drops that section instead of failing the build.
 */
async function list<T>(path: string, pick: (json: unknown) => T[]): Promise<T[]> {
  try {
    const res = await fetch(`${API}/api${path}`);
    if (!res.ok) return [];
    return pick(await res.json());
  } catch {
    return [];
  }
}

const slugs = (json: unknown): { slug: string }[] =>
  ((json as { results?: { slug: string }[] })?.results ?? []) as { slug: string }[];
const ids = (json: unknown): { id: string }[] => (Array.isArray(json) ? json : ((json as { results?: { id: string }[] }).results ?? []));

const STATIC_PATHS: [string, number][] = [
  ["", 1],
  ["/browse", 0.9],
  // NOTE: there is no `/courses` index — the catalogue lives at /browse, and
  // /courses/<slug> is the only real route, so listing it advertised a 404.
  ["/resources", 0.8],
  ["/paths", 0.7],
  ["/organizations", 0.6],
  ["/lecturers", 0.6],
  ["/premium", 0.8],
  ["/search", 0.5],
  ["/legal/privacy", 0.3],
  ["/legal/terms", 0.3],
  ["/legal/refund", 0.3],
];

/**
 * Every URL the site actually exports. `output: export` means the dynamic
 * routes exist only for the slugs baked in at build time, so this reads the
 * live catalogue at build time and never advertises a page that 404s.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, resources, lecturers, organizations, lists] = await Promise.all([
    list("/courses?limit=100", slugs),
    list("/resources?limit=100", slugs),
    list("/lecturers", slugs),
    list("/organizations", slugs),
    list("/lists", ids),
  ]);

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map(([path, priority]) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly" as const,
    priority,
  }));

  for (const { slug } of courses) entries.push({ url: `${BASE}/courses/${slug}`, priority: 0.8 });
  for (const { slug } of resources) entries.push({ url: `${BASE}/resources/${slug}`, priority: 0.6 });
  for (const { slug } of lecturers) entries.push({ url: `${BASE}/lecturers/${slug}`, priority: 0.5 });
  for (const { slug } of organizations) entries.push({ url: `${BASE}/organizations/${slug}`, priority: 0.5 });
  for (const { id } of lists) entries.push({ url: `${BASE}/lists/${id}`, priority: 0.4 });

  return entries;
}
