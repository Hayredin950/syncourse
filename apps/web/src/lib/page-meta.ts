/**
 * Build-time metadata helpers for the exported detail routes.
 *
 * Every page in this app is exported as static HTML, so `generateMetadata`
 * runs in the same build pass as the page itself — which is why these reads use
 * a plain cached `fetch` and not the `cache: "no-store"` helpers in
 * `static-params.ts`. A no-store fetch makes an exported route fail outright
 * ("Route … with dynamic = error couldn't be rendered statically because it
 * used revalidate: 0"), which is exactly how the sitemap came out empty the
 * first time. A failed read here just falls back to the layout's metadata
 * instead of breaking the build.
 */
export const SITE_NAME = "Syncourse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://syncourse-web.vercel.app").replace(
  /\/$/,
  "",
);

export async function fetchMeta<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Meta descriptions want a sentence, not the whole blurb. */
export function summarise(text: string | null | undefined, max = 155): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
