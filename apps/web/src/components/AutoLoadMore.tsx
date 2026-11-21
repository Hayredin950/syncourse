"use client";

import { useEffect, useRef } from "react";

/**
 * Pulls the next page in when the end of a list scrolls into view.
 *
 * The manual "Load more" button stays below this sentinel on purpose: it is the
 * retry control when a page fails, and it keeps the list usable in browsers
 * without IntersectionObserver.
 *
 * `disabled` is read from a ref rather than a dependency so that toggling it
 * during a request does not re-arm the observer. `resetKey` is the only thing
 * that re-arms it, and callers pass something that changes when a page lands
 * (item count, query, filters). If a page fails and nothing is appended, the
 * key stays put, so the failed load cannot retry itself in a loop — the reader
 * uses the button.
 */
export default function AutoLoadMore({
  onLoad,
  disabled = false,
  resetKey,
}: {
  onLoad: () => void;
  disabled?: boolean;
  resetKey?: string | number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const loadRef = useRef(onLoad);
  const disabledRef = useRef(disabled);
  loadRef.current = onLoad;
  disabledRef.current = disabled;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired || disabledRef.current) return;
        if (!entries.some((entry) => entry.isIntersecting)) return;
        fired = true;
        loadRef.current();
      },
      // Start before the button reaches the viewport so the next page is
      // usually there by the time the reader would have reached for it.
      { rootMargin: "360px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [resetKey]);

  return <div ref={ref} aria-hidden="true" style={{ height: 1 }} />;
}
