"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * Share this page.
 *
 * It replaced a "Follow" button on the lecturer and publisher pages that had no
 * `onClick` — and could not have had one, because `Follow` in the schema joins a
 * user to a user; there is no lecturer or organization side to it. A control that
 * cannot work is worse than no control, and sharing is the thing people were
 * actually reaching for on a page about somebody else.
 *
 * Confirms in its own label rather than through a toast, so it drops into a page
 * that has no toast of its own — which is both of them.
 */
export function ShareButton({ title, label = "Share" }: { title: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    // The native sheet where there is one; on desktop Chrome and Firefox there
    // isn't, and the clipboard is the next best thing.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* dismissed, or blocked — fall through to the clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard on an insecure origin; the address bar still has the link */
    }
  };

  return (
    <button className="btn" onClick={share} aria-live="polite">
      {copied ? (
        <>
          <Check size={14} /> Link copied
        </>
      ) : (
        <>
          <Share2 size={14} /> {label}
        </>
      )}
    </button>
  );
}
