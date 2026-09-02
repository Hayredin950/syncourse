const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

/**
 * Optimized image URL for course covers / avatars / banners.
 * - With NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME set at build time: serves the image
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
 * The same asset, but delivered as a download.
 *
 * A cross-origin `<a download>` attribute is ignored by browsers, so a PDF or a
 * spreadsheet opens in a tab — or renders as gibberish — instead of landing in
 * the downloads folder. Cloudinary answers with `Content-Disposition:
 * attachment` when `fl_attachment` is in the transformation chain. Anything not
 * served by Cloudinary comes back untouched and behaves however its host decides.
 */
export function attachmentUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/upload\/)(.*)$/.exec(url);
  if (!m) return url;
  return m[2].startsWith("fl_attachment") ? url : `${m[1]}fl_attachment/${m[2]}`;
}
