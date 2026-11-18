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
import type { Metadata } from "next";
import { cloudinaryUrl } from "./cloudinary";

export const SITE_NAME = "Syncourse";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://syncourse.pages.dev").replace(
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

/**
 * The card a link unfurls into somewhere else.
 *
 * Next merges metadata one field at a time, so returning `openGraph` from a
 * page throws away the layout's whole object — including its image. A course
 * page that only declared title/url therefore used to have no picture at all,
 * and a page with a picture still handed X the default one because `twitter`
 * was untouched. Every detail route builds its share block here instead:
 * the item's own picture when it has one, the site card when it does not, and
 * the same image on both Open Graph and Twitter.
 */
export function shareMetadata({
  title,
  description,
  url,
  image,
  imageAlt,
  type = "article",
}: {
  title: string;
  description?: string;
  url: string;
  image?: string | null;
  imageAlt?: string;
  type?: "article" | "profile" | "website";
}): Pick<Metadata, "openGraph" | "twitter"> {
  // A 1200px rendition is the width scraper cards are built around and it is
  // still the same picture. Only our own Cloudinary assets are resized: a
  // remote or relative URL is handed over untouched rather than risk a proxy
  // that the scraper cannot reach.
  const src =
    image && /^https:\/\/res\.cloudinary\.com\//.test(image)
      ? (cloudinaryUrl(image, { width: 1200, format: false }) ?? image)
      : image || null;

  const images = src
    ? [{ url: src, alt: imageAlt ?? title }]
    : [
        {
          url: "/social-preview.png",
          width: 1731,
          height: 909,
          alt: "Syncourse — Learn anything, stay in sync.",
        },
      ];

  return {
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}
