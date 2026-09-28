import type { MetadataRoute } from "next";

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://syncourse-web.vercel.app").replace(/\/$/, "");

/** `output: export` refuses to emit a metadata route that could be dynamic. */
export const dynamic = "force-static";

/**
 * There was no robots.txt at all before this — crawlers had to guess, and the
 * signed-in surfaces (/admin, /me, /my-learning) were as indexable as the
 * catalogue. Disallow those; everything public stays crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/me", "/my-learning", "/lists/detail"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
