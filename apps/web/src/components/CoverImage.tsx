"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { cloudinaryUrl, type CloudinaryOpts } from "@/lib/cloudinary";

/**
 * An `<img>` that gets out of the way when it cannot load.
 *
 * Every cover, avatar and logo on the site is delivered by Cloudinary, which
 * means one third-party host has to resolve on the visitor's network for the
 * catalogue to look like a catalogue. When it does not — a carrier proxy that
 * re-encodes or blocks images, a DNS filter, a phone that dropped off wifi
 * mid-scroll — the old markup rendered `image ? <img> : <fallback>`, decided
 * once from whether a URL *exists*. A URL that exists and does not arrive took
 * the fallback branch away and left a flat coloured box with nothing in it, on
 * every card at once.
 *
 * So the decision moves from "is there a URL" to "did the picture arrive", and
 * it is made twice:
 *
 * 1. The transformed URL (`f_auto,q_auto,w_…`). `f_auto` negotiates AVIF or
 *    WebP off the request's `Accept` header, and that negotiation is the part
 *    most likely to break on a network that rewrites traffic.
 * 2. The original, untransformed URL. Bigger and unoptimised, but it is a plain
 *    `.jpg` from the same host, so it survives a mangled `Accept` and a
 *    transformation edge that is having a bad minute.
 *
 * Only when both fail does it render nothing at all — which is the point. The
 * caller keeps its own gradient and glyph *behind* this element rather than
 * beside it, so an image that never arrives degrades to a branded placeholder
 * instead of a hole. Nothing here retries on a timer: a failed decode is not a
 * transient the browser will fix, and a card that flickers between two states
 * is worse than one that settles.
 */
export function CoverImage({
  src,
  transform,
  alt = "",
  className,
  style,
  eager = false,
  onSettled,
  onNaturalSize,
  onClick,
}: {
  src: string | null | undefined;
  /** Passed to `cloudinaryUrl`. Omit for an asset that should not be resized. */
  transform?: CloudinaryOpts;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** Above the fold — skips `loading="lazy"`, which delays nothing worth delaying there. */
  eager?: boolean;
  /** Told whether the picture arrived, for a caller that styles around it. */
  onSettled?: (ok: boolean) => void;
  /**
   * The decoded pixel size, for a caller that sizes its frame from the picture
   * rather than the other way round — the resource gallery gives each screenshot
   * its own aspect ratio so tall sheets are not centre-cropped.
   */
  onNaturalSize?: (width: number, height: number) => void;
  /** For the lightbox, which stops a click on the picture from closing itself. */
  onClick?: (e: MouseEvent<HTMLImageElement>) => void;
}) {
  // 0 = transformed, 1 = the original, 2 = give up and show what is behind us.
  const [attempt, setAttempt] = useState(0);

  // A rail re-renders with new data into the same DOM node, so a card that
  // failed would stay failed for whatever course scrolled into its place.
  useEffect(() => setAttempt(0), [src]);

  if (!src || attempt > 1) return null;

  const url = attempt === 0 ? (cloudinaryUrl(src, transform) ?? src) : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      style={style}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onClick={onClick}
      onError={() => {
        setAttempt((a) => a + 1);
        if (attempt === 1) onSettled?.(false);
      }}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (onNaturalSize && el.naturalWidth && el.naturalHeight) {
          onNaturalSize(el.naturalWidth, el.naturalHeight);
        }
        onSettled?.(true);
      }}
    />
  );
}
