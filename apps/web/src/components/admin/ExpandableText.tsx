"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Two-line clamp with a real expand toggle.
 *
 * Lecturer and publisher bios were being cut with `bio.slice(0, 80)`, which
 * chops mid-word, gives no sign that anything was removed, and offers no way to
 * read the rest. This clamps with CSS (so the cut lands on a line boundary and
 * gets a proper ellipsis) and only offers the toggle when the text really is
 * taller than the clamp — measured, not guessed from string length.
 */
export default function ExpandableText({
  text,
  lines = 2,
  className = "",
}: {
  text: string | null | undefined;
  lines?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    check();
    // A column resize can turn three lines into two, so re-measure on resize.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;

  return (
    <div className={className}>
      <p
        ref={ref}
        className={`admin-expand__text ${open ? "" : "admin-expand__text--clamped"}`}
        style={open ? undefined : { WebkitLineClamp: lines }}
      >
        {text}
      </p>
      {(truncated || open) && (
        <button type="button" className="admin-expand__toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
