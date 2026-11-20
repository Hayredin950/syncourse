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
 *
 * `gravity` says which part of the picture survives a crop. It matters for the
 * documents: a cheat-sheet cover is a screenshot of a page, and the default
 * centre crop takes a 16:10 slice out of its middle, which is a band of text cut
 * off mid-sentence at both ends. `north` keeps the top, where the heading is.
 */
export type CloudinaryOpts = {
  width?: number;
  height?: number;
  gravity?: "north" | "auto" | "face";
  /**
   * `f_auto` picks the smallest format the *browser* accepts, which is right
   * for the page. A share scraper is not a browser: some unfurlers reject the
   * AVIF/WebP they are handed, so the social preview asks for the original
   * format instead (`format: false`).
   */
  format?: boolean;
};

export function cloudinaryUrl(
  url: string | null | undefined,
  opts: CloudinaryOpts = {},
): string | null {
  if (!url) return null;

  const parts: string[] = [];
  if (opts.format !== false) parts.push("f_auto");
  parts.push("q_auto");
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.width && opts.height) parts.push("c_fill");
  else if (opts.width || opts.height) parts.push("c_limit");
  if (opts.gravity && opts.width && opts.height) parts.push(`g_${opts.gravity}`);
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

/** `https://res.cloudinary.com/<cloud>/video/upload/` + the rest. */
const VIDEO_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/;

/**
 * A still frame from a Cloudinary video.
 *
 * A resource that is only a video used to open with an empty hero: there is no
 * cover image in the post, so the banner was pure tint and the page looked
 * broken above the player. Cloudinary can lift a frame out of the video itself
 * (`so_auto` lets it pick a representative one instead of a black first frame)
 * and deliver it as a JPEG, which costs no extra upload and cannot drift from
 * the video it belongs to.
 *
 * Returns null for anything not on our own Cloudinary video path — a Telegram
 * file id has no frame we can address, and proxying a remote video just to get a
 * screenshot would be slower than showing the player with its poster attribute.
 */
export function videoPoster(
  url: string | null | undefined,
  opts: { width?: number; at?: number } = {},
): string | null {
  if (!url) return null;
  const m = VIDEO_UPLOAD.exec(url);
  if (!m) return null;
  const rest = m[2];
  if (!rest || rest.startsWith("so_")) return null;
  const frame = opts.at !== undefined ? `so_${opts.at}` : "so_auto";
  const shape = `w_${opts.width ?? 1200},c_limit,q_auto,f_auto`;
  return `${m[1]}${frame},${shape}/${rest.replace(/\.[a-z0-9]{2,5}$/i, "")}.jpg`;
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
