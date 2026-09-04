"use client";

import { useState } from "react";

/**
 * One avatar, five callers. Before this the users, lecturers, publishers and
 * reviews lists each built their own <span class="admin-avatar"> — same markup,
 * three different sizes, and a letter fallback whose colour was fixed, so every
 * initial in a list was the same amber and told you nothing.
 *
 * Two things it adds over the markup it replaces:
 *
 *  - a hue hashed from the name, so the same person keeps the same badge colour
 *    everywhere in the console and a column of initials becomes scannable;
 *  - an error fallback, because a broken remote image otherwise leaves a hole
 *    the size of the avatar with nothing in it.
 */
const HUES = 6;

/** Deterministic small hash — the same string always lands on the same bucket. */
function bucket(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % HUES;
}

export default function AdminAvatar({
  src,
  name,
  square = false,
  size,
  contain = false,
}: {
  src?: string | null;
  name?: string | null;
  /** Publishers are logos, not faces: square, and never cropped. */
  square?: boolean;
  size?: number;
  contain?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const label = (name ?? "").trim();
  const initial = label ? label[0].toUpperCase() : "?";
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.38) } : undefined;

  return (
    <span
      className={`admin-avatar ${square ? "admin-avatar--sq" : ""} admin-avatar--h${bucket(label || initial)}`}
      style={style}
      aria-hidden="true"
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          style={contain ? { objectFit: "contain" } : undefined}
        />
      ) : (
        initial
      )}
    </span>
  );
}
