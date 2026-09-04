const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

/** `https://res.cloudinary.com/<cloud>/image/upload/` + the rest. */
const UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

/**
 * Optimized image URL for course covers / avatars / banners / resource sheets.
 *
 * Three cases, and the first one used to be missed:
 * - Already on our own Cloudinary account (`/image/upload/…`): the transformation
 *   is spliced into the delivery path. This is where every uploaded asset lives,
 *   and the old `url.includes("res.cloudinary.com")` early return meant those —
 *   i.e. all of them — were served as the untouched original: full resolution,
 *   original format, no `q_auto`. Nine 1023×1280 JPEGs on a cheat-sheet page came
 *   to ~900KB where they should be ~460KB, and on a phone an image that has not
 *   arrived is an image that is not there.
 * - A remote URL, with a cloud name configured: proxied through `/image/fetch/`.
 * - Anything else: returned untouched, so the app works with zero config.
 *
 * `c_fill` only when both dimensions are given — that is a cover, and cropping to
 * the box is the point. With a width alone the caller wants the same picture,
 * smaller, so `c_limit` keeps the aspect ratio and never upscales.
 */
export function cloudinaryUrl(
  url: string | null | undefined,
  opts: { width?: number; height?: number } = {},
): string | null {
  if (!url) return null;

  const parts: string[] = ["f_auto", "q_auto"];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.width && opts.height) parts.push("c_fill");
  else if (opts.width || opts.height) parts.push("c_limit");
  const t = parts.join(",");

  const own = UPLOAD.exec(url);
  if (own) {
    // A path that already carries a transformation was built deliberately by
    // another caller (`fl_attachment`, say) — leave it alone rather than stack a
    // second chain on top of it. A version segment (`v123…`) is not one.
    const first = own[2].split("/")[0] ?? "";
    if (first && !/^v\d+$/.test(first) && first.includes("_")) return url;
    return own[1] + t + "/" + own[2];
  }

  if (!CLOUD || url.includes("res.cloudinary.com")) return url;
  return `https://res.cloudinary.com/${CLOUD}/image/fetch/${t}/${encodeURIComponent(url)}`;
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
