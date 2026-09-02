const CLOUD = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

/**
 * Optimized image URL for course covers / avatars / banners.
 * - With EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME set at build time: serves the image
 *   through Cloudinary (auto format + quality, optional resize) — f_auto/q_auto.
 * - Without it: returns the URL untouched, so the app works with zero config.
 */
export function cloudinaryUrl(
  url: string | null | undefined,
  opts: { width?: number; height?: number } = {},
): string | null {
  if (!url) return null;
  if (!CLOUD || url.includes("res.cloudinary.com")) return url;

  const parts: string[] = ["f_auto", "q_auto"];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.width || opts.height) parts.push("c_fill");

  return `https://res.cloudinary.com/${CLOUD}/image/fetch/${parts.join(",")}/${encodeURIComponent(url)}`;
}

/**
 * Force a Cloudinary asset to arrive as a saved file rather than opening in a
 * viewer, by injecting `fl_attachment` into the transformation chain. A plain
 * link hands a spreadsheet or a zip to whatever the OS thinks can preview it;
 * `fl_attachment` makes Cloudinary send `Content-Disposition: attachment`, so
 * the browser's download manager takes it instead.
 *
 * Non-Cloudinary URLs are returned untouched — there is nothing to rewrite.
 */
export function attachmentUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/upload\/)(.*)$/.exec(url);
  if (!m) return url;
  return m[2].startsWith("fl_attachment") ? url : `${m[1]}fl_attachment/${m[2]}`;
}
