"use client";

import { useEffect, useState } from "react";

/**
 * Confirmation toast with a short, consistent on-screen lifetime.
 * Auto-dismisses after `duration` ms (1.6s default) so transient
 * confirmations like "Link copied" don't linger on screen.
 */
export function useToast(duration = 1600) {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), duration);
    return () => clearTimeout(t);
  }, [toast, duration]);
  return { toast, setToast };
}
